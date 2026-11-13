import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { SupportReads } from "@/lib/ai/support-draft";
import { supportDraft } from "@/lib/moves/support-draft";
import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";
import { rightNow } from "@/tests/support/clock";

/**
 * The support agent (docs/specs/report-a-problem.md, "The support agent"):
 * only the owner with their code gets a suggestion; it reads as their
 * session; one is kept for each thing the sender said, in a table only the
 * owner reads; a fold must name another report and a deletion an account;
 * and nothing on the report changes until the owner does it.
 */

const db = adminClient();

let house: House;
let ava: Actor;
let ben: Actor;
let owner: Actor;
let ownerNoCode: Actor;

beforeEach(async () => {
  house = await makeHouse(["Ava", "Ben"]);
  [ava, ben] = house.everyone;
  owner = await signedInUser("Glyn Finck");
  ownerNoCode = await signedInUser("Owner without a code");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
});

async function sent(actor: Actor, words = `The bins John vanished ${randomUUID()}`): Promise<string> {
  const res = await actor.db.rpc("send_report", { p_kind: "problem", p_words: words });
  expectOk(res);
  return res.data as string;
}

const as = (who: Actor) => ({ db: who.db, userId: who.userId });

describe("the support agent", () => {
  it("suggests on a waiting report, reading as the owner, and keeps it", async () => {
    const tag = randomUUID();
    const main = await sent(ben, `Bins gone ${tag}`);
    const report = await sent(ava);
    const { data: named } = await db.from("houses").select("name").eq("id", house.id).single();
    let read: string[] = [];
    const first = await supportDraft(as(owner), report, rightNow(), async (r, _today, reads: SupportReads) => {
      expect(r.house).toBe(named?.name);
      read = [await reads.theirHouse(), await reads.theirReports(), await reads.similar(tag), await reads.deletions(""), await reads.audit(""), reads.page("stake", false)];
      return { raw: { reply: "Thanks Ava, I'm looking at it.", action: "same_as", same_as: main, why: "Ben said the same." }, inputTokens: 9, outputTokens: 4 };
    });
    expect(first).toMatchObject({
      draft: { state: "ready", reply: "Thanks Ava, I'm looking at it.", action: "same_as", sameAs: { id: main, name: "Ben" }, why: "Ben said the same." },
    });
    expect(read[0]).toContain(`<from_people>${named?.name}</from_people>`);
    expect(read[0]).toMatch(/House Pass/);
    expect(read[2]).toContain(main);

    // Opening it again gives the same one, without asking.
    const again = await supportDraft(as(owner), report, rightNow(), async () => {
      throw new Error("asked twice");
    });
    expect(again).toEqual(first);

    // Suggesting changed nothing on the report: the owner does that.
    const { data: row } = await db.from("reports").select("state").eq("id", report).single();
    expect(row?.state).toBe("open");
    const { count } = await db.from("report_messages").select("id", { count: "exact", head: true }).eq("report_id", report);
    expect(count).toBe(0);
  });

  it("writes a new one when the sender writes back", async () => {
    const report = await sent(ava);
    const reply = (text: string) => async () => ({ raw: { reply: text, action: "none" as const, same_as: "", why: "" }, inputTokens: 1, outputTokens: 1 });
    expect(await supportDraft(as(owner), report, rightNow(), reply("First."))).toMatchObject({ draft: { reply: "First." } });
    expectOk(await ava.db.rpc("write_back", { p_report: report, p_body: "Still gone." }));
    expect(await supportDraft(as(owner), report, rightNow(), reply("Second."))).toMatchObject({ draft: { reply: "Second." } });
    const { data } = await owner.db.from("support_drafts").select("reply").eq("report_id", report).order("created_at");
    expect(data?.map((d) => d.reply)).toEqual(["First.", "Second."]);
  });

  it("refuses a housemate, a visitor and the owner without their code, before Claude", async () => {
    const report = await sent(ava);
    for (const who of [ava, ownerNoCode]) {
      let asked = false;
      const result = await supportDraft(as(who), report, rightNow(), async () => {
        asked = true;
        throw new Error("asked");
      });
      expect(result).toEqual({ refusal: { code: "42501", message: "owner_only" } });
      expect(asked).toBe(false);
      expectDenied(await who.db.rpc("claim_support_draft", { p_report: report, p_message: null, p_limit: 10 }));
    }
    expect((await visitor().rpc("claim_support_draft", { p_report: report, p_message: null, p_limit: 10 })).error).not.toBeNull();

    // The owner's drafts are theirs alone.
    await supportDraft(as(owner), report, rightNow(), async () => ({ raw: { reply: "Hi.", action: "none", same_as: "", why: "" }, inputTokens: 1, outputTokens: 1 }));
    for (const who of [ava, ownerNoCode]) {
      const { data } = await who.db.from("support_drafts").select("id");
      expect(data ?? []).toEqual([]);
    }
    expect((await ava.db.from("support_drafts").insert({ report_id: report })).error).not.toBeNull();
  });

  it("keeps a reply alone when its step can't be done", async () => {
    const report = await sent(ava);
    const claim = await owner.db.rpc("claim_support_draft", { p_report: report, p_message: null, p_limit: 10 });
    expectOk(claim);
    const draft = (claim.data as { draft: { id: string } }).draft.id;
    // Folding into itself.
    const done = await owner.db.rpc("finish_support_draft", {
      p_draft: draft,
      p_reply: "Hi.",
      p_action: "same_as",
      p_same_as: report,
      p_why: "",
      p_input: 1,
      p_output: 1,
    });
    expectOk(done);
    expect(done.data).toMatchObject({ state: "ready", action: "none", same_as: null });
    // A finished one can't be written again.
    expect((await owner.db.rpc("finish_support_draft", { p_draft: draft, p_reply: "x", p_action: "none", p_same_as: null, p_why: "", p_input: 0, p_output: 0 })).error).not.toBeNull();
  });

  it("is used or set aside by the owner, once", async () => {
    const report = await sent(ava);
    const result = await supportDraft(as(owner), report, rightNow(), async () => ({ raw: { reply: "Hi.", action: "delete", same_as: "", why: "" }, inputTokens: 1, outputTokens: 1 }));
    if (!("draft" in result) || !result.draft) throw new Error("no draft");
    expect(result.draft.action).toBe("delete");
    expectDenied(await ava.db.rpc("owner_set_support_draft", { p_draft: result.draft.id, p_state: "used" }));
    expectOk(await owner.db.rpc("owner_set_support_draft", { p_draft: result.draft.id, p_state: "used" }));
    expect((await owner.db.rpc("owner_set_support_draft", { p_draft: result.draft.id, p_state: "dismissed" })).error).not.toBeNull();
    // Nobody was deleted by the suggestion itself.
    const { count } = await db.from("account_deletions").select("id", { count: "exact", head: true }).eq("user_id", ava.userId);
    expect(count).toBe(0);
  });

  it("stops at the day's limit", async () => {
    const one = await sent(ava);
    const two = await sent(ben);
    expectOk(await owner.db.rpc("claim_support_draft", { p_report: one, p_message: null, p_limit: 1 }));
    const refused = await owner.db.rpc("claim_support_draft", { p_report: two, p_message: null, p_limit: 1 });
    expect(refused.error?.message).toBe("support_limit");
    // The one already claimed comes back without counting again.
    expectOk(await owner.db.rpc("claim_support_draft", { p_report: one, p_message: null, p_limit: 1 }));
  });
});
