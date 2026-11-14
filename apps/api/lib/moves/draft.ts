import "server-only";

import { askRef, CHAT_RESETS_MAX, type Category, foldPoint, houseKind, LANGUAGE_IN_ENGLISH, languageOf, wordsFor, ASK_TURN_RESERVE, askAllowance, CHAT_TURNS_PER_PERSON_PER_DAY, draftForModel, editDraft, firstName, groupDef, johnDef, listAsDraft, localDate, offlineTurn, passOf, hasPass, PERMISSIONS, rulesOf, tidyAsk, tidyDraft, tidyReply, type ChatMessage, type ChatMove, type ChatReset, type ChatResponse, type ChatSummed, type EditResult, type HouseDraft, askOperationsFor, type Permission, type RawDraft } from "@app/core";

import { askClaude, canDraft, type DraftAnswer, type DraftContext, type JonzTools } from "@/lib/ai/house-draft";
import { sumUpChat, type SumUpChat } from "@/lib/ai/sum-up";
import { createAdminClient } from "@/lib/supabase/admin";

import { houseReads } from "./ask-reads";
import { awayMoves } from "./ask-away";
import { operationMoves } from "./ask-operations";
import { accountSince, askWeek, usageNow } from "./ask-usage";
import { offerResets, resetState, type ResetState } from "./ask-resets";
import type { Caller, Refusal } from "./disputes";
import { myPermissions } from "./permitted";

/** A kind of John as list_johns shows it, with its ref for save_kind, order_kinds and delete_kind, and the starting kind it began as. */
type KindLine = { id: string; name: string; colour: string; preset: Category | null };

/** The John list as list_johns shows it: a line a John, refs and all, then the groups, then the house's kinds in order. */
function listLines(raw: RawDraft, kinds: readonly KindLine[]): string {
  const johns = raw.johns ?? [];
  const lines = johns.length === 0 ? ["The list is empty."] : johns.map((j) => JSON.stringify({ ...j, ref: j.ref ?? "new" }));
  for (const g of raw.groups ?? []) lines.push(`Group ${String(g.name)}: ${Array.isArray(g.members) ? g.members.join(", ") : ""}`);
  for (const k of kinds) lines.push(`Kind ${k.name} (ref ${askRef(k.id)}, colour ${k.colour})`);
  return lines.join("\n");
}

/** One turn of the chat: the house, what's been said, the draft so far (if any), and the summary of what came before a long chat's cut. */
type ChatTurn = {
  houseId: string;
  messages: readonly ChatMessage[];
  current: HouseDraft | null;
  now: Date;
  earlier?: { summary?: string | null; sumUp?: SumUpChat };
};

const NOT_IN_HOUSE = { refusal: { code: "42501", message: "not_in_house" } } as const;
const NOT_THEIRS: EditResult = { ok: false, said: "That isn't something this person can do." };

/** The house as the chat reads it, through the person's own session: the house, who lives there, the list and the groups. */
async function readHouse(caller: Caller, houseId: string) {
  const [{ data: house }, { data: members }, { data: johns }, { data: groups }, { data: kinds }] = await Promise.all([
    caller.db.from("houses").select("*").eq("id", houseId).single(),
    caller.db.from("members").select("user_id, role, joined_at, profiles(display_name, language)").eq("house_id", houseId).order("joined_at"),
    caller.db
      .from("johns")
      .select("id, name, john_kind_id, points, every_weeks, every_months, week_of_month, anchor_month, due_dow, due_time, needs_photo, group_id, kind, respond_hours, per_week, crew")
      .eq("house_id", houseId)
      .is("archived_at", null)
      .order("created_at"),
    caller.db.from("groups").select("id, name, group_members(user_id)").eq("house_id", houseId).order("name"),
    caller.db.from("john_kinds").select("id, name, colour, preset").eq("house_id", houseId).order("position").order("name"),
  ]);
  return { house, members: members ?? [], johns: johns ?? [], groups: groups ?? [], kinds: (kinds ?? []).map((k) => ({ ...k, preset: k.preset as Category | null })) };
}

type HouseRead = Awaited<ReturnType<typeof readHouse>>;
type HouseRow = NonNullable<HouseRead["house"]>;

/** Everyone in the house with a name, the person writing first: "me" in what they say is them. */
function everyoneIn(members: HouseRead["members"], me: string) {
  const everyone = members
    .map((m) => ({ userId: m.user_id, name: m.profiles?.display_name ?? "", role: m.role }))
    .filter((p) => p.name);
  everyone.sort((a, b) => Number(b.userId === me) - Number(a.userId === me));
  return everyone;
}

type Admin = ReturnType<typeof createAdminClient>;
type Language = ReturnType<typeof languageOf>;

/**
 * Writes the turn down before Claude is asked (claim_ask_turn), against the
 * week's pool: the house's own week, so it comes back when the house's week
 * starts. Hands back the turn and what's left before it (Claude wraps up
 * rather than pass it, agent.ts), or the refusal.
 */
async function claimTurn(admin: Admin, who: { house: HouseRow; userId: string; people: number; now: Date }): Promise<{ refusal: Refusal } | { turn: string; budget: number }> {
  const { week, pool } = askWeek(who.house, who.now);
  const { cap } = askAllowance({ pool, people: who.people, houseUsed: 0, mineUsed: 0, resetsAt: week.endsAt });
  const { data: claimed, error: limit } = await admin.rpc("claim_ask_turn", {
    p_house: who.house.id,
    p_user: who.userId,
    p_since: week.startsAt.toISOString(),
    p_pool: pool,
    p_share: cap,
    p_user_day: CHAT_TURNS_PER_PERSON_PER_DAY,
    p_reserve: ASK_TURN_RESERVE,
    // The account's cap is the house's pool too, over the last ASK_ACCOUNT_DAYS days in any house.
    p_account: pool,
    p_account_since: accountSince(who.now).toISOString(),
  });
  if (limit) {
    if (["draft_limit", "ask_pool_used", "ask_share_used", "ask_account_used"].includes(limit.message)) {
      return { refusal: { code: "P0001", message: limit.message } };
    }
    throw new Error(`Couldn't count the week's Ask Jonz: ${limit.message}`);
  }
  const turn = claimed?.[0]?.turn;
  if (!turn) throw new Error("Couldn't count the week's Ask Jonz: no turn");
  return { turn, budget: Math.max(0, Number(claimed[0].room)) };
}

/** What the admin might want put right. Without it the chat still drafts. */
async function resetStateOrNull(caller: Caller, houseId: string, now: Date): Promise<ResetState | null> {
  try {
    return await resetState(caller, houseId, now);
  } catch (e) {
    console.error("reset_state_failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** What a turn knows and doesn't change: who is asking, the house, and what they may do. */
interface Scene {
  caller: Caller;
  houseId: string;
  now: Date;
  house: HouseRow;
  rules: ReturnType<typeof rulesOf>;
  /** Everyone in the house, the person asking first. */
  everyone: ReturnType<typeof everyoneIn>;
  may: (p: Permission) => boolean;
  /** The house's list as it is, or null for a new house. */
  list: HouseDraft | null;
  /** The house's kinds of John, in order, as list_johns shows them. */
  kinds: readonly KindLine[];
  state: ResetState | null;
}

/** What a turn changes as Claude calls its tools: the draft, in draftForModel's words, and what's on the card. */
interface Sitting {
  raw: RawDraft;
  changed: boolean;
  resets: ChatReset[];
  moves: ChatMove[];
}

/** A group drafted: one the house has gets its new people under Changing, a new one is made with the Johns that need it. */
function draftGroup({ list }: Scene, raw: RawDraft, group: { name: string; members: string[] }): { result: EditResult; next: RawDraft } {
  const named = group.name.trim();
  if (!named || group.members.length === 0) return { result: { ok: false, said: "A group needs a name and someone in it." }, next: raw };
  const there = (list?.groups ?? []).find((g) => g.name.toLocaleLowerCase() === named.toLocaleLowerCase());
  const others = (raw.groups ?? []).filter((g) => String(g.name).toLocaleLowerCase() !== named.toLocaleLowerCase());
  const said = there
    ? `"${there.name}" will be ${group.members.join(", ")} once they tap Apply. Its Johns stay in it.`
    : `Group "${named}" drafted. Put Johns in it with group "${named}", or it won't be made.`;
  return { result: { ok: true, said }, next: { ...raw, groups: [...others, { name: there?.name ?? named, members: group.members }] } };
}

/** A fix offered for the card, checked against what can be put right. */
async function offerOneReset({ caller, houseId, now, state, may }: Scene, resets: ChatReset[], r: Parameters<JonzTools["offerReset"]>[0]): Promise<EditResult> {
  if (!state || !may("history:write")) return { ok: false, said: "Resets aren't available here." };
  if (resets.length >= CHAT_RESETS_MAX) return { ok: false, said: `That's ${CHAT_RESETS_MAX} already: offer fewer.` };
  const [offered] = await offerResets(caller, houseId, [r], state, now);
  if (!offered) return { ok: false, said: "That doesn't match anything that can be put right: check the refs in house_now." };
  if (resets.some((o) => JSON.stringify(o) === JSON.stringify(offered))) return { ok: true, said: "Already on the card." };
  resets.push(offered);
  return { ok: true, said: "On the card." };
}

/** Jonz's tools for this turn. A tool is only offered to someone who may use it, but a model's call is checked all the same. */
function draftTools(scene: Scene, sitting: Sitting): JonzTools {
  const { caller, houseId, now, house, rules, everyone, may, state } = scene;
  const away = awayMoves(caller, houseId, localDate(now, rules.timezone), sitting.moves);
  const cardMoves = operationMoves(caller, houseId, may, everyone, sitting.moves);
  const kept = (result: EditResult, next: RawDraft): EditResult => {
    if (result.ok) {
      sitting.raw = next;
      sitting.changed = true;
    }
    return result;
  };
  return {
    reads: houseReads(caller, houseId, { house: { name: house.name, kind: house.kind, awayMakeup: house.away_makeup }, rules, people: everyone, now }),
    listJohns: () => listLines(sitting.raw, scene.kinds),
    edit(e) {
      if (!may("johns:write")) return NOT_THEIRS;
      const { raw: next, result } = editDraft(sitting.raw, e);
      return kept(result, next);
    },
    setGroup(name, members) {
      if (!may("groups:write")) return NOT_THEIRS;
      const { result, next } = draftGroup(scene, sitting.raw, { name, members });
      return kept(result, next);
    },
    offerReset: (r) => offerOneReset(scene, sitting.resets, r),
    offerAway: (a) => (may("away:write_own") ? away.offerAway(a) : Promise.resolve(NOT_THEIRS)),
    offerCancelAway: (ref) => (may("away:write_own") ? away.offerCancelAway(ref) : Promise.resolve(NOT_THEIRS)),
    offerOperation: (name, given) => cardMoves.offer(name, given),
    operations: askOperationsFor(may),
    may: {
      add: may("johns:write"),
      change: may("johns:write"),
      remove: may("johns:write"),
      groups: may("groups:write") && may("johns:write"),
      resets: state !== null,
      away: may("away:write_own"),
    },
  };
}

/**
 * A long chat: its start summed up (with the summary it came with), the rest
 * read as it is. If summing up fails, Jonz reads the latest messages only.
 */
async function sumUpStart(messages: readonly ChatMessage[], earlier: NonNullable<ChatTurn["earlier"]>, language: Language) {
  let summary = earlier.summary?.trim() || null;
  let summed: ChatSummed | undefined;
  const spent = { input: 0, output: 0 };
  const fold = foldPoint(messages);
  if (fold === 0) return { summary, chat: messages, summed, spent };
  try {
    const notes = await (earlier.sumUp ?? sumUpChat)(summary, messages.slice(0, fold), LANGUAGE_IN_ENGLISH[language]);
    summary = notes.text;
    summed = { text: notes.text, count: fold };
    spent.input += notes.inputTokens;
    spent.output += notes.outputTokens;
  } catch (e) {
    console.error("sum_up_failed", e instanceof Error ? e.message : e);
  }
  return { summary, chat: messages.slice(fold), summed, spent };
}

/** What Claude is told about the house and the person writing; the rest of its context is the turn's own. */
function draftContext({ caller, house, rules, everyone, list, state, now }: Scene, language: Language): Omit<DraftContext, "allowed" | "messages" | "earlier" | "budget"> {
  const family = house.kind === "family";
  const myRole = everyone.find((p) => p.userId === caller.userId)?.role ?? "member";
  return {
    people: everyone.map((p) => firstName(p.name)),
    me: { name: firstName(everyone[0]?.name ?? "") || "the person writing", role: family ? (myRole === "admin" ? "parent" : "kid") : myRole },
    houseName: house.name,
    family,
    language: LANGUAGE_IN_ENGLISH[language],
    weekStarts: rules.weekStarts,
    today: `${new Intl.DateTimeFormat("en-GB", { timeZone: rules.timezone, weekday: "long" }).format(now)} ${localDate(now, rules.timezone)}, ${new Intl.DateTimeFormat("en-GB", { timeZone: rules.timezone, hour: "2-digit", minute: "2-digit" }).format(now)}`,
    editing: list !== null,
    now: state?.text ?? null,
  };
}

/** Only a turn that changed something sends a draft back; null leaves the card as it was. */
function draftOut({ caller, everyone, list, kinds }: Scene, sitting: Sitting): HouseDraft | null {
  const known = { johnIds: (list?.johns ?? []).map((j) => j.id!), groups: list?.groups ?? [], kinds };
  const people = everyone.map(({ userId, name }) => ({ userId, name }));
  const tidied = sitting.changed ? tidyDraft(sitting.raw, people, caller.userId, known) : null;
  // A new house's draft with nothing in it is no draft; a list taken down to nothing is a change.
  return tidied && (tidied.johns.length > 0 || list) ? tidied : null;
}

/** Who is asking and what they may do, and the house as it stands; or why the chat isn't theirs. */
async function openTurn(caller: Caller, houseId: string, now: Date) {
  const allowed = await myPermissions(caller, houseId);
  if (allowed.length === 0) return NOT_IN_HOUSE;
  const may = (p: Permission) => allowed.includes(p);
  const { house, members, johns, groups, kinds } = await readHouse(caller, houseId);
  if (!house) return NOT_IN_HOUSE;
  // The person asking reads Jonz's words, and its answers, in their own language.
  const language = languageOf(members.find((m) => m.user_id === caller.userId)?.profiles?.language);
  // A house with a list already: the House Pass's assistant. Setting up a new house is free.
  const list = johns.length > 0 ? listAsDraft(johns.map(johnDef), groups.map(groupDef), kinds) : null;
  if (list && !hasPass(passOf(house), now)) return { refusal: { code: "P0001", message: "pass_needed" } } as const;
  return { allowed, may, house, members, list, kinds, language };
}

/**
 * One turn of the chat with Jonz, for anyone in the house. The chat so far
 * (ending with what they just said) and the draft as it stands in; Jonz's
 * reply, a question to tap an answer to, the new draft and any resets out.
 *
 * Jonz acts as the person asking (lib/ai/house-draft.ts): it reads what they
 * can read, through their own session, and gets a write tool only for a move
 * they may make (my_permissions, so the database decides). Its writes change
 * a draft of the list held here, one John a call; the card shows the draft
 * and nothing is written until they tap Apply, which goes through the list's
 * own grants. A new house's chat drafts its first list, free; a house with a
 * list already is the House Pass's (`pass_needed` without it).
 *
 * A house shares one pool of Claude's tokens a week (ASK_POOL_TOKENS,
 * bigger with the House Pass), of which nobody uses more than half when two
 * or more live there; a person also gets CHAT_TURNS_PER_PERSON_PER_DAY turns
 * a day. Each turn is written down before Claude is asked (claim_ask_turn),
 * so turns sent together can't all slip under the pool, and each answer says
 * what's left (allowance). When Claude isn't set up or doesn't answer, offlineTurn answers (a
 * starter list that fits, or the draft left as it is), so setup never stops
 * here.
 *
 * A long chat (more than CHAT_SUM_AT messages since its last summary) is
 * summed up first, all but its latest CHAT_RECENT messages, into one with
 * the summary it came with (`earlier.summary`); Jonz reads the summary and
 * the latest messages, and the answer brings the new summary back
 * (`summed`) for the app to send from then on. Summing up counts towards
 * the same turn. If it fails, Jonz reads the latest messages only.
 *
 * `ask` is Claude, and `earlier.sumUp` the summary's writer, unless a test stands in.
 */
export async function chatTurn(
  caller: Caller,
  { houseId, messages, current, now, earlier = {} }: ChatTurn,
  ask: (ctx: DraftContext, tools: JonzTools) => Promise<DraftAnswer> = askClaude,
): Promise<{ refusal: Refusal } | ChatResponse> {
  const opened = await openTurn(caller, houseId, now);
  if (opened.refusal) return { refusal: opened.refusal };
  const { allowed, may, house, members, list, kinds, language } = opened;
  const words = wordsFor(language, houseKind(house.kind));
  const draftNow = current ?? list;
  const offline = (): ChatResponse =>
    may("johns:write") ? offlineTurn(messages, draftNow, { words, kinds }) : { reply: words('ask.draft.offlineAsk'), ask: null, draft: null, source: "starter" };
  if (!canDraft() && ask === askClaude) return offline();

  const everyone = everyoneIn(members, caller.userId);
  const admin = createAdminClient();
  const claim = await claimTurn(admin, { house, userId: caller.userId, people: everyone.length, now });
  if ("refusal" in claim) return claim;
  const state = list && may("history:write") ? await resetStateOrNull(caller, houseId, now) : null;
  const scene: Scene = { caller, houseId, now, house, rules: rulesOf(house), everyone, may, list, kinds, state };
  const people = everyone.map(({ userId, name }) => ({ userId, name }));
  const raw: RawDraft = draftNow ? draftForModel(draftNow, people, caller.userId) : { johns: [], groups: [], note: null };
  const sitting: Sitting = { raw, changed: false, resets: [], moves: [] };
  const tools = draftTools(scene, sitting);
  const { summary, chat, summed, spent } = await sumUpStart(messages, earlier, language);

  let answer: DraftAnswer;
  try {
    // Summing up came out of what was left.
    const budget = Math.max(0, claim.budget - spent.input - spent.output);
    const permitted = allowed.map((p) => PERMISSIONS[p]).filter(Boolean);
    answer = await ask({ ...draftContext(scene, language), allowed: permitted, messages: chat, earlier: summary, budget }, tools);
  } catch (e) {
    console.error("draft_failed", e instanceof Error ? e.message : e);
    await admin.from("house_drafts").update({ outcome: "failed", input_tokens: spent.input, output_tokens: spent.output }).eq("id", claim.turn);
    return offline();
  }

  const draft = draftOut(scene, sitting);
  await admin
    .from("house_drafts")
    .update({ johns: draft?.johns.length ?? 0, input_tokens: answer.inputTokens + spent.input, output_tokens: answer.outputTokens + spent.output })
    .eq("id", claim.turn);
  const reply = tidyReply(answer.raw.reply);
  const { resets, moves } = sitting;
  // Nothing to say and nothing drafted before: a starter list does better than silence.
  if (!reply && !draft && !draftNow && resets.length === 0 && moves.length === 0) return offline();
  return {
    reply,
    ask: tidyAsk(answer.raw.ask),
    draft,
    source: "ai",
    ...(resets.length > 0 ? { resets } : {}),
    ...(moves.length > 0 ? { moves } : {}),
    // What's left after this turn, for the chat's warning and the usage page.
    allowance: await usageNow(house, members.map((m) => m.user_id), caller.userId, now),
    ...(summed ? { summed } : {}),
  };
}
