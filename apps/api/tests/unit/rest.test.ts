// The query layer that answers supabase-js's builder straight from Postgres
// (lib/db/rest.ts): what SQL each shape of query becomes. The db project
// runs every engine test through it against the real stack; these pin the
// SQL itself, with no database.

import { describe, expect, it } from "vitest";

import {
  parseSelect,
  restClient,
  type Backend,
  type LooseDb,
  type Meta,
} from "@/lib/db/rest";

const meta: Meta = {
  keys: [
    {
      name: "assignments_house_id_fkey",
      table: "assignments",
      columns: ["house_id"],
      target: "houses",
      targetColumns: ["id"],
    },
    {
      name: "assignments_week_id_fkey",
      table: "assignments",
      columns: ["week_id"],
      target: "weeks",
      targetColumns: ["id"],
    },
    {
      name: "disputes_assignment_id_fkey",
      table: "disputes",
      columns: ["assignment_id"],
      target: "assignments",
      targetColumns: ["id"],
    },
    {
      name: "swap_offers_asker_fkey",
      table: "swap_offers",
      columns: ["asker_assignment_id", "house_id"],
      target: "assignments",
      targetColumns: ["id", "house_id"],
    },
    {
      name: "swap_offers_asked_fkey",
      table: "swap_offers",
      columns: ["asked_assignment_id", "house_id"],
      target: "assignments",
      targetColumns: ["id", "house_id"],
    },
  ],
  unique: new Map([
    ["assignments", [["id"]]],
    ["houses", [["id"]]],
    ["weeks", [["id"]]],
    ["disputes", [["id"]]],
    ["house_pass", [["house_id"]]],
  ]),
};

/** A client that records the SQL it would run and answers with `rows`. */
function recording(rows: Record<string, unknown>[] = []) {
  const seen: { text: string; params: unknown[]; contained: boolean }[] = [];
  const backend: Backend = {
    run: async (text, params, contained) => {
      seen.push({ text, params, contained });
      return rows;
    },
    signature: async () => ({
      args: { p_house: "uuid", p_ids: "uuid[]" },
      returnsSet: false,
      returnsVoid: false,
    }),
    call: async (_s, name, args) => ({ name, args }),
    meta: async () => meta,
  };
  // Untyped: these tables are the test's own, not the app's schema.
  return { db: restClient(backend) as unknown as LooseDb, seen };
}

describe("parseSelect", () => {
  it("reads columns, aliases, JSON paths, casts and embedded tables with hints", () => {
    const items = parseSelect(
      "id, at:created_at, data->>away, n::text, asker:assignments!swap_offers_asker_fkey(name), weeks!inner(starts_on)",
    );
    expect(
      items.map((i) => (i.kind === "star" ? "*" : `${i.kind}:${i.key}`)),
    ).toEqual([
      "column:id",
      "column:at",
      "column:away",
      "column:n",
      "embed:asker",
      "embed:weeks",
    ]);
    const weeks = items[5];
    expect(weeks.kind === "embed" && weeks.inner).toBe(true);
  });
});

describe("restClient", () => {
  it("embeds a to-one table as an object and a to-many one as an ordered list", async () => {
    const { db, seen } = recording([{ j: { id: "a" } }]);
    const { data, error } = await db
      .from("assignments")
      .select("id, houses(timezone), disputes(id, reason)")
      .eq("house_id", "h1")
      .order("created_at", { referencedTable: "disputes", ascending: false })
      .limit(5, { referencedTable: "disputes" });
    expect(error).toBeNull();
    expect(data).toEqual([{ id: "a" }]);
    const { text, params } = seen[0];
    expect(text).toContain(
      `(select jsonb_build_object('timezone', t1."timezone") from public."houses" t1 where t1."id" = t0."house_id" limit 1)`,
    );
    expect(text).toContain(`coalesce(jsonb_agg(e.j), '[]'::jsonb)`);
    expect(text).toContain(`t2."assignment_id" = t0."id"`);
    expect(text).toContain(`order by t2."created_at" desc limit 5`);
    expect(text).toContain(`where t0."house_id" = $1`);
    expect(params).toEqual(["h1"]);
  });

  it("filters on an embedded table, and !inner drops rows with nothing there", async () => {
    const { db, seen } = recording();
    await db
      .from("assignments")
      .select("id, weeks!inner(starts_on)")
      .lt("weeks.starts_on", "2027-01-04")
      .order("weeks(starts_on)", { ascending: false });
    const { text } = seen[0];
    expect(text).toContain(
      `exists (select 1 from public."weeks" t1 where t1."id" = t0."week_id" and t1."starts_on" < $`,
    );
    expect(text).toContain(
      `order by (select o."starts_on" from public."weeks" o where o."id" = t0."week_id") desc`,
    );
  });

  it("follows the foreign key a hint names, over more than one column", async () => {
    const { db, seen } = recording();
    await db
      .from("swap_offers")
      .select("id, asked:assignments!swap_offers_asked_fkey(name)");
    expect(seen[0].text).toContain(
      `t1."id" = t0."asked_assignment_id" and t1."house_id" = t0."house_id"`,
    );
  });

  it("refuses an embed it can't tell apart, as PostgREST does", async () => {
    const { db } = recording();
    const { error } = await db
      .from("swap_offers")
      .select("id, assignments(name)");
    expect(error?.code).toBe("PGRST201");
  });

  it("reads or() strings, in(), is(), not() and JSON paths", async () => {
    const { db, seen } = recording();
    await db
      .from("assignments")
      .select("id")
      .or(
        `ends_at.is.null,ends_at.gt.2027-01-04T00:00:00.000Z,name.ilike.*dish*`,
      )
      .in("id", ["a", 'b"c'])
      .is("done_at", null)
      .not("flagged_at", "is", null)
      .eq("data->>away", "t1");
    const { text, params } = seen[0];
    expect(text).toContain(
      `(t0."ends_at" is null or t0."ends_at" > $1 or t0."name" ilike $2)`,
    );
    expect(text).toContain(`t0."id" = any($3)`);
    expect(text).toContain(`t0."done_at" is null`);
    expect(text).toContain(`not (t0."flagged_at" is null)`);
    expect(text).toContain(`t0."data"->>'away' = $4`);
    expect(params).toEqual([
      "2027-01-04T00:00:00.000Z",
      "%dish%",
      '{"a","b\\"c"}',
      "t1",
    ]);
  });

  it("counts without rows for head: true", async () => {
    const { db, seen } = recording([{ n: "3" }]);
    const { count, data } = await db
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("house_id", "h1");
    expect(count).toBe(3);
    expect(data).toBeNull();
    expect(seen[0].text).toMatch(
      /^select count\(\*\) as n from public\."assignments" t0 where/,
    );
  });

  it("answers single() with one row, and PGRST116 otherwise", async () => {
    const one = recording([{ j: { id: "a" } }]);
    expect(
      (await one.db.from("houses").select("id").eq("id", "a").single()).data,
    ).toEqual({ id: "a" });
    const none = recording([]);
    expect(
      (await none.db.from("houses").select("id").eq("id", "a").single()).error
        ?.code,
    ).toBe("PGRST116");
    expect(
      (await none.db.from("houses").select("id").eq("id", "a").maybeSingle())
        .data,
    ).toBeNull();
  });

  it("writes through jsonb_populate_record, so each value takes its column's type", async () => {
    const { db, seen } = recording([{ j: { id: "a" } }]);
    await db
      .from("houses")
      .update({ ticked_at: "2027-01-04T09:30:00.000Z" })
      .eq("id", "h1");
    await db
      .from("houses")
      .update({ name: "x", timezone: "Europe/London" })
      .eq("id", "h1");
    await db
      .from("disputes")
      .insert([{ id: "d1", reason: "no" }, { id: "d2" }])
      .select("id");
    await db.from("house_pass").upsert({ house_id: "h1", state: "active" });
    await db.from("disputes").delete().eq("id", "d1");
    const texts = seen.map((s) => s.text);
    expect(texts[0]).toContain(
      `set "ticked_at" = (select r."ticked_at" from jsonb_populate_record(null::public."houses", $1::jsonb) r) where t0."id" = $2`,
    );
    expect(texts[1]).toContain(
      `set ("name", "timezone") = (select r."name", r."timezone" from`,
    );
    expect(texts[2]).toMatch(
      /^with t0 as \(insert into public\."disputes" as t0 \("id", "reason"\) select "id", "reason" from jsonb_populate_recordset/,
    );
    expect(texts[3]).toContain(
      `on conflict ("house_id") do update set "state" = excluded."state"`,
    );
    expect(texts[4]).toContain(
      `delete from public."disputes" t0 where t0."id" = $1`,
    );
    expect(seen.every((s) => s.contained)).toBe(true);
  });

  it("calls a database function with its named arguments", async () => {
    const { db } = recording();
    const { data } = await db.rpc("house_balances", { p_house: "h1" });
    expect(data).toEqual({ name: "house_balances", args: { p_house: "h1" } });
  });
});
