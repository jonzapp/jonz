import { randomUUID } from "node:crypto";

import type { Actor } from "./clients";
import { ANON_KEY, SUPABASE_URL } from "./env";
import { addJohns, deal, makeHouse, thisWeek } from "./factories";

// Helpers for the registry's database tests (tests/db/operations.test.ts
// and operation-io.test.ts): each callable function as PostgREST describes
// it, values to call it with, and a house with real rows to point them at.

type Schema = { properties?: Record<string, { format?: string; type?: string }>; required?: string[] };
export type Ids = Record<string, string>;

type Param = { in: string; name: string; format?: string; type?: string; required?: boolean; schema?: Schema; $ref?: string };
type OpenApi = { paths: Record<string, { get?: { parameters?: Param[] }; post?: { parameters?: Param[] } }>; parameters: Record<string, Param> };

/** One argument of a function: its Postgres type, and whether a call must give it. */
export interface Arg {
  type: string;
  required: boolean;
}

/**
 * Each function a signed-in person may call, with its arguments by name, as
 * PostgREST describes it to them: a write's arguments are its body, a read's
 * are query parameters.
 */
export async function functionArgs(who: Actor): Promise<Record<string, Record<string, Arg>>> {
  const { data } = await who.db.auth.getSession();
  const token = data.session!.access_token;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` } });
  const doc = (await res.json()) as OpenApi;
  const argsOf = (item: OpenApi["paths"][string]): [string, Arg][] => {
    const body = item.post?.parameters?.find((p) => p.in === "body")?.schema;
    if (body) {
      const required = body.required ?? [];
      return Object.entries(body.properties ?? {}).map(([name, p]) => [name, { type: p.format ?? p.type ?? "text", required: required.includes(name) }]);
    }
    return (item.get?.parameters ?? [])
      .map((p) => (p.$ref ? doc.parameters[p.$ref.split("/").pop()!] : p))
      .filter((p) => p?.in === "query" && !/^(select|order|limit|offset|on_conflict|columns)$/.test(p.name))
      .map((p) => [p.name, { type: p.format ?? p.type ?? "text", required: p.required === true }]);
  };
  return Object.fromEntries(
    Object.entries(doc.paths)
      .filter(([path]) => path.startsWith("/rpc/"))
      .map(([path, item]) => [path.slice("/rpc/".length), Object.fromEntries(argsOf(item))]),
  );
}

/** Each callable function's arguments by name and Postgres type. */
export async function signatures(who: Actor): Promise<Record<string, Record<string, string>>> {
  const fns = await functionArgs(who);
  return Object.fromEntries(Object.entries(fns).map(([fn, args]) => [fn, Object.fromEntries(Object.entries(args).map(([n, a]) => [n, a.type]))]));
}

/** A value for one argument: the house's real row for an id it names, else something well formed. */
export function valueFor(name: string, type: string, ids: Ids): unknown {
  if (type === "uuid") return ids[name] ?? randomUUID();
  if (type.endsWith("[]")) return type === "uuid[]" ? [ids.p_user] : [];
  if (type === "boolean") return true;
  if (/^(int|integer|smallint|bigint|numeric)/.test(type)) return 1;
  if (type === "date") return "2030-01-07";
  if (type.startsWith("timestamp")) return "2030-01-07T09:00:00.000Z";
  if (type === "jsonb" || type === "json") return {};
  return name === "p_month" ? "2030-01" : "x";
}

/** A house of two with a John dealt this week and a group, and the ids its functions' arguments name. */
export async function aHouse() {
  const house = await makeHouse(["Ava", "Ben"]);
  const week = thisWeek();
  const [john] = await addJohns(house.id, [{ name: "Bins" }], week);
  const { assignments } = await deal(house.id, week, new Date(week.startsOn));
  const assignment = assignments[0].id;
  const group = (await house.admin.db.rpc("save_group", { p_house: house.id, p_group: null as unknown as string, p_name: "Upstairs", p_members: [house.admin.userId] })).data as string;
  const ben = house.members[0].userId;
  const ids: Ids = {
    h: house.id, p_house: house.id, p_from: house.id,
    p_john: john.id, p_assignment: assignment, p_mine: assignment, p_theirs: assignment,
    p_group: group, p_user: ben, p_kid: ben, p_to: ben, other: ben,
  };
  return { house, ids };
}
