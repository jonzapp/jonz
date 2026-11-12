import { describe, expect, it, vi } from "vitest";

import {
  OWNER_ASK_COVERAGE,
  OWNER_MATRIX,
  OWNER_MOVE_PERMISSION,
  OWNER_MOVES_MAX,
  OWNER_PERMISSION_NAMES,
  OWNER_ROLES,
  OWNER_WRITE_TOOLS,
  OwnerMove,
  type OwnerMove as Move,
  type OwnerPermission,
} from "@app/core";

import { ownerToolSet, type OwnerReads, type OwnerWrites } from "@/lib/ai/owner-ask";
import type { Caller } from "@/lib/moves/disputes";
import { ownerWrites } from "@/lib/moves/owner-ask";

/**
 * The owner's Ask Jonz does what the admin pages do, the way a house's
 * does: each move is a tool that puts it on a card, given only with its
 * permission (OWNER_ASK_COVERAGE), and checked against the database before
 * it goes on the card.
 */

const reads = new Proxy({}, { get: () => async () => "" }) as OwnerReads;
const READS = ["audit", "deletions", "find_houses", "find_people", "house", "inbox", "messages", "notices", "promotions", "read_page"];
const ok = async () => ({ ok: true, said: "ok" });
const writes = (may: Partial<Record<OwnerPermission, boolean>>): OwnerWrites => ({
  replyToReport: ok,
  markFixed: ok,
  reopenReport: ok,
  sameAs: ok,
  saveNotice: ok,
  endNotice: ok,
  sendMessage: ok,
  makePromotion: ok,
  promotionMove: ok,
  deletionMove: ok,
  startDeletion: ok,
  deleteHouse: ok,
  resetHouse: ok,
  may: { ...(Object.fromEntries(OWNER_PERMISSION_NAMES.map((p) => [p, false])) as Record<OwnerPermission, boolean>), ...may },
});
const everything = Object.fromEntries(OWNER_PERMISSION_NAMES.map((p) => [p, true]));

describe("every owner move has a way through Jonz", () => {
  it("says how Jonz handles each one", () => {
    expect(Object.keys(OWNER_ASK_COVERAGE).sort()).toEqual([...OWNER_PERMISSION_NAMES].sort());
  });

  it("gives an owner who may only look every read and no writes", () => {
    expect(Object.keys(ownerToolSet(reads, writes({ "admin:read": true }))).sort()).toEqual(READS);
  });

  it("gives each card move's tools with its permission, and only then", () => {
    for (const [perm, c] of Object.entries(OWNER_ASK_COVERAGE)) {
      if (c.by !== "card") continue;
      const only = Object.keys(ownerToolSet(reads, writes({ [perm]: true })));
      expect(only.filter((t) => !READS.includes(t)).sort(), perm).toEqual([...c.tools].sort());
    }
  });

  it("has no write tool the list doesn't account for", () => {
    const all = Object.keys(ownerToolSet(reads, writes(everything))).filter((t) => !READS.includes(t));
    expect(all.sort()).toEqual([...OWNER_WRITE_TOOLS].sort());
  });

  it("names a permission for every kind of move on the card", () => {
    const kinds = OwnerMove.options.map((o) => o.shape.kind.value).sort();
    expect(Object.keys(OWNER_MOVE_PERMISSION).sort()).toEqual(kinds);
  });
});

const REPORT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PROMO = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const NOTICE = "55555555-5555-4555-8555-555555555555";

/** A caller whose session answers each read, recording what it was asked. */
function caller(answers: Record<string, unknown>, notice: unknown = null) {
  const asked: string[] = [];
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: notice, error: null }) };
  const db = {
    rpc: vi.fn(async (name: string) => (asked.push(name), { data: answers[name] ?? [], error: null })),
    from: vi.fn(() => chain),
  };
  return { caller: { db, userId: USER } as unknown as Caller, asked };
}
const NOW = new Date("2026-11-08T12:00:00Z");

describe("ownerWrites", () => {
  const reports = { owner_reports_page: [{ id: REPORT, name: "Ava", state: "open" }, { id: OTHER, name: "Ben", state: "fixed" }] };

  it("puts a reply to a report it found on the card, with whose it is", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller(reports);
    expect(await ownerWrites(c, "owner", NOW, moves).replyToReport(REPORT, "Thanks, fixed now.")).toMatchObject({ ok: true });
    expect(moves).toEqual([{ kind: "report_reply", reportId: REPORT, who: "Ava", body: "Thanks, fixed now." }]);
  });

  it("refuses an id no read gave, and puts nothing on the card", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller(reports);
    const w = ownerWrites(c, "owner", NOW, moves);
    expect(await w.replyToReport("99999999-9999-4999-8999-999999999999", "Hi")).toMatchObject({ ok: false });
    expect(await w.markFixed(OTHER, "", true)).toMatchObject({ ok: false, said: "That report is fixed already." });
    expect(await w.reopenReport(REPORT)).toMatchObject({ ok: false });
    expect(await w.sameAs(REPORT, REPORT)).toMatchObject({ ok: false });
    expect(moves).toEqual([]);
  });

  it("only offers a deletion for an account that's waiting, by its id", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller({ owner_deletions_page: [{ user_id: USER, name: "Cal", email: "cal@example.com" }] });
    const w = ownerWrites(c, "owner", NOW, moves);
    expect(await w.deletionMove("deletion_now", "44444444-0000-4000-8000-000000000000", "")).toMatchObject({ ok: false });
    expect(await w.deletionMove("deletion_now", USER, "They asked")).toMatchObject({ ok: true });
    expect(moves).toEqual([{ kind: "deletion_now", userId: USER, who: "Cal", reason: "They asked" }]);
  });

  it("starts a deletion only for an email someone has", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller({ owner_people_find: [{ id: USER, name: "Cal", email: "Cal@example.com" }] });
    const w = ownerWrites(c, "owner", NOW, moves);
    expect(await w.startDeletion("nobody@example.com", "")).toMatchObject({ ok: false });
    expect(await w.startDeletion(" cal@EXAMPLE.com ", "Asked by email")).toMatchObject({ ok: true });
    expect(moves).toEqual([{ kind: "deletion_start", email: "cal@example.com", reason: "Asked by email" }]);
  });

  it("checks a promotion can do what's asked of it", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller({ owner_promotions_page: [{ id: PROMO, code: "SPRING25", state: "live", audience: "anyone" }] });
    const w = ownerWrites(c, "owner", NOW, moves);
    expect(await w.promotionMove("promotion_email", PROMO)).toMatchObject({ ok: false });
    expect(await w.promotionMove("promotion_retry", PROMO)).toMatchObject({ ok: false });
    expect(await w.promotionMove("promotion_stop", PROMO)).toMatchObject({ ok: true });
    expect(await w.makePromotion({ name: "Again", note: null, code: "spring25", kind: "trial", percent: null, amount: null, duration: null, months: null, plans: [], audience: "anyone", people: [], endsAt: null, maxUses: null })).toMatchObject({ ok: false, said: "SPRING25 is taken: pick another code." });
    expect(moves).toEqual([{ kind: "promotion_stop", id: PROMO, code: "SPRING25" }]);
  });

  it("puts a notice on the card only when its words fit and it starts before it ends", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller({}, { id: NOTICE, title: "Down for a bit", ends_at: null });
    const w = ownerWrites(c, "owner", NOW, moves);
    const notice = { id: null, kind: "status" as const, title: "Back up", body: "Sorry about that.", linkLabel: null, linkUrl: null, startsAt: null, endsAt: null };
    expect(await w.saveNotice({ ...notice, title: "x".repeat(81) })).toMatchObject({ ok: false });
    expect(await w.saveNotice({ ...notice, endsAt: "2026-11-01T00:00:00Z" })).toMatchObject({ ok: false, said: "It ends before it starts." });
    expect(await w.saveNotice({ ...notice, linkLabel: "Read more" })).toMatchObject({ ok: false });
    expect(await w.saveNotice(notice)).toMatchObject({ ok: true });
    expect(await w.endNotice(NOTICE)).toMatchObject({ ok: true });
    expect(moves.map((m) => m.kind)).toEqual(["notice_save", "notice_end"]);
  });

  it("sends a message only to a person or house a read found, by at least one way", async () => {
    const moves: Move[] = [];
    const { caller: c } = caller({ owner_people_find: [{ id: USER, name: "Cal", email: "cal@example.com" }] });
    const w = ownerWrites(c, "owner", NOW, moves);
    const message = { audience: "person" as const, personId: USER, houseId: null, subject: "Hello", body: "Thanks for trying Jonz.", push: true, wall: false, email: false };
    expect(await w.sendMessage({ ...message, push: false })).toMatchObject({ ok: false });
    expect(await w.sendMessage({ ...message, personId: OTHER })).toMatchObject({ ok: false });
    expect(await w.sendMessage(message)).toMatchObject({ ok: true });
    expect(moves).toEqual([{ kind: "message_send", audience: "person", personId: USER, houseId: null, to: "Cal", subject: "Hello", body: "Thanks for trying Jonz.", push: true, wall: false, email: false }]);
  });

  it(`puts ${OWNER_MOVES_MAX} on the card at most, and the same one once`, async () => {
    const moves: Move[] = [];
    const { caller: c } = caller(reports);
    const w = ownerWrites(c, "owner", NOW, moves);
    expect(await w.replyToReport(REPORT, "One")).toMatchObject({ ok: true });
    expect(await w.replyToReport(REPORT, "One")).toMatchObject({ said: "Already on the card." });
    for (let n = 2; n <= OWNER_MOVES_MAX; n++) await w.replyToReport(REPORT, `Reply ${n}`);
    expect(await w.replyToReport(REPORT, "Too many")).toMatchObject({ ok: false });
    expect(moves).toHaveLength(OWNER_MOVES_MAX);
  });

  it("gives each app role exactly its column of the owner matrix", () => {
    const { caller: c } = caller({});
    for (const role of OWNER_ROLES) {
      const { may } = ownerWrites(c, role, NOW, []);
      for (const p of OWNER_PERMISSION_NAMES) expect(may[p], `${role} ${p}`).toBe(OWNER_MATRIX[p][role]);
    }
  });

  it("keeps a move the role can't make off the card", async () => {
    const { caller: c } = caller({}, { id: NOTICE, title: "Down for a bit", ends_at: null });
    const moves: Move[] = [];
    const said = await ownerWrites(c, "support", NOW, moves).endNotice(NOTICE);
    expect(said).toMatchObject({ ok: false, said: expect.stringContaining("your role") });
    expect(moves).toEqual([]);
    // The same move an owner may put on the card.
    expect(await ownerWrites(c, "owner", NOW, moves).endNotice(NOTICE)).toMatchObject({ ok: true });
  });
});
