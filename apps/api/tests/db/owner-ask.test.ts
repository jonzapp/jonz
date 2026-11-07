import { OWNER_ASK_TURNS_PER_DAY, type ChatMessage } from "@app/core";
import { beforeEach, describe, expect, it } from "vitest";

import type { OwnerReads } from "@/lib/ai/owner-ask";
import { ownerTurn } from "@/lib/moves/owner-ask";
import { adminClient, signedInUser, visitor, type Actor } from "@/tests/support/clients";
import { expectDenied, expectOk } from "@/tests/support/expect";
import { makeHouse, type House } from "@/tests/support/factories";
import { passSecondFactor } from "@/tests/support/mfa";

/**
 * The owner's Ask Jonz (docs/specs/owner-admin.md, "Ask Jonz, owner"): only
 * the owner with their code gets an answer; it reads the admin pages as
 * their session; each turn is written down, in a table only the owner reads,
 * before Claude is asked; and a day has a limit.
 */

const db = adminClient();
const said = (text: string): ChatMessage[] => [{ role: "user", text }];
const answer = { raw: { reply: "Nothing waiting.", ask: { kind: "none" as const, options: [] } }, inputTokens: 7, outputTokens: 3 };

let house: House;
let ava: Actor;
let owner: Actor;
let ownerNoCode: Actor;

beforeEach(async () => {
  house = await makeHouse(["Ava", "Ben"]);
  [ava] = house.everyone;
  owner = await signedInUser("Glyn Finck");
  ownerNoCode = await signedInUser("Owner without a code");
  expectOk(await db.from("app_owners").insert([{ user_id: owner.userId }, { user_id: ownerNoCode.userId }]));
  await passSecondFactor(owner);
});

describe("the owner's Ask Jonz", () => {
  it("answers the owner, reading the admin pages as them, and writes the turn down", async () => {
    let read: string[] = [];
    const result = await ownerTurn({ db: owner.db, userId: owner.userId }, said("Who's in Ava's house?"), new Date(), async (_m, today, reads: OwnerReads) => {
      expect(today).toMatch(/\d{4}/);
      read = [
        await reads.inbox("", "waiting", null),
        await reads.deletions(""),
        await reads.audit("", null, null),
        await reads.notices(),
        await reads.messages(""),
        await reads.people("Ava"),
        await reads.houses(house.code),
        reads.howItWorks("stake", false),
      ];
      return answer;
    });
    expect(result).toEqual({ reply: "Nothing waiting.", ask: null, source: "ai" });
    expect(read[5]).toContain("<from_people>Ava</from_people>");
    expect(read[6]).toContain(`2 living there [id ${house.id}]`);
    expect(read[7]).toContain("Nobody loses more than");

    const { data: turns } = await owner.db.from("owner_ask_turns").select("question, reply, input_tokens, output_tokens");
    expect(turns).toEqual([{ question: "Who's in Ava's house?", reply: "Nothing waiting.", input_tokens: 7, output_tokens: 3 }]);
  });

  it("refuses a housemate, a visitor and the owner without their code, before Claude", async () => {
    for (const who of [ava, ownerNoCode]) {
      let asked = false;
      const result = await ownerTurn({ db: who.db, userId: who.userId }, said("Show me the inbox"), new Date(), async () => {
        asked = true;
        return answer;
      });
      expect(result).toEqual({ refusal: { code: "42501", message: "owner_only" } });
      expect(asked).toBe(false);
    }
    expectDenied(await ava.db.rpc("claim_owner_ask", { p_question: "Hi", p_limit: 10 }));
    expectDenied(await ownerNoCode.db.rpc("claim_owner_ask", { p_question: "Hi", p_limit: 10 }));
    expect((await visitor().rpc("claim_owner_ask", { p_question: "Hi", p_limit: 10 })).error).not.toBeNull();
  });

  it("keeps the owner's turns from everyone else, and from anyone writing them by hand", async () => {
    expectOk(await owner.db.rpc("claim_owner_ask", { p_question: "Private question", p_limit: 10 }));
    for (const who of [ava, ownerNoCode]) {
      const { data } = await who.db.from("owner_ask_turns").select("id");
      expect(data ?? []).toEqual([]);
    }
    expect((await owner.db.from("owner_ask_turns").insert({ question: "Written by hand" })).error).not.toBeNull();
    await owner.db.from("owner_ask_turns").delete().neq("question", "");
    expect((await owner.db.from("owner_ask_turns").select("id")).data).toHaveLength(1);
  });

  it("stops at the day's limit", async () => {
    const today = Array.from({ length: OWNER_ASK_TURNS_PER_DAY }, (_, i) => ({ owner_id: owner.userId, question: `Question ${i}` }));
    expectOk(await db.from("owner_ask_turns").insert(today));
    const result = await ownerTurn({ db: owner.db, userId: owner.userId }, said("One more?"), new Date(), async () => answer);
    expect(result).toEqual({ refusal: { code: "P0001", message: "ask_limit" } });
  });

  it("forgets turns after 90 days", async () => {
    const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 89 * 86_400_000).toISOString();
    expectOk(await db.from("owner_ask_turns").insert([
      { owner_id: owner.userId, question: "Long ago", asked_at: old },
      { owner_id: owner.userId, question: "A while ago", asked_at: recent },
    ]));
    expectOk(await owner.db.rpc("claim_owner_ask", { p_question: "Today", p_limit: 10 }));
    const { data } = await owner.db.from("owner_ask_turns").select("question").order("asked_at");
    expect(data?.map((t) => t.question)).toEqual(["A while ago", "Today"]);
  });
});
