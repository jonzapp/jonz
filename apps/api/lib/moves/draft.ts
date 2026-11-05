import "server-only";

import {
  CHAT_RESETS_MAX,
  CHAT_TURNS_PER_DAY,
  CHAT_TURNS_PER_PERSON_PER_DAY,
  draftForModel,
  editDraft,
  firstName,
  groupDef,
  HOUSE_DRAFT_COPY,
  johnDef,
  listAsDraft,
  localDate,
  offlineTurn,
  passOf,
  passUnlocked,
  PERMISSIONS,
  rulesOf,
  tidyAsk,
  tidyDraft,
  tidyReply,
  type ChatMessage,
  type ChatReset,
  type ChatResponse,
  type EditResult,
  type HouseDraft,
  type Permission,
  type RawDraft,
} from "@app/core";

import { askClaude, canDraft, type DraftAnswer, type DraftContext, type JonzTools } from "@/lib/ai/house-draft";
import { createAdminClient } from "@/lib/supabase/admin";

import { houseReads } from "./ask-reads";
import { offerResets, resetState, type ResetState } from "./ask-resets";
import type { Caller, Refusal } from "./disputes";
import { myPermissions } from "./permitted";

/** The John list as list_johns shows it: a line a John, refs and all, then the groups. */
function listLines(raw: RawDraft): string {
  const johns = raw.johns ?? [];
  if (johns.length === 0) return "The list is empty.";
  const lines = johns.map((j) => JSON.stringify({ ...j, ref: j.ref ?? "new" }));
  for (const g of raw.groups ?? []) lines.push(`Group ${String(g.name)}: ${Array.isArray(g.members) ? g.members.join(", ") : ""}`);
  return lines.join("\n");
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
 * A house gets CHAT_TURNS_PER_DAY turns from Claude a day, a person
 * CHAT_TURNS_PER_PERSON_PER_DAY. Each turn is written down before Claude is
 * asked (claim_draft_turn), so turns sent together can't all slip under the
 * limit. When Claude isn't set up or doesn't answer, offlineTurn answers (a
 * starter list that fits, or the draft left as it is), so setup never stops
 * here.
 *
 * `ask` is Claude, unless a test stands in for it.
 */
export async function chatTurn(
  caller: Caller,
  houseId: string,
  messages: readonly ChatMessage[],
  current: HouseDraft | null,
  now: Date,
  ask: (ctx: DraftContext, tools: JonzTools) => Promise<DraftAnswer> = askClaude,
): Promise<{ refusal: Refusal } | ChatResponse> {
  const allowed = await myPermissions(caller, houseId);
  if (allowed.length === 0) return { refusal: { code: "42501", message: "not_in_house" } };
  const may = (p: Permission) => allowed.includes(p);

  const [{ data: house }, { data: members }, { data: johns }, { data: groups }] = await Promise.all([
    caller.db.from("houses").select("*").eq("id", houseId).single(),
    caller.db.from("members").select("user_id, role, joined_at, profiles(display_name)").eq("house_id", houseId).order("joined_at"),
    caller.db
      .from("johns")
      .select("id, name, category, points, every_weeks, every_months, week_of_month, anchor_month, due_dow, due_time, needs_photo, group_id, kind, respond_hours, per_week, crew")
      .eq("house_id", houseId)
      .is("archived_at", null)
      .order("created_at"),
    caller.db.from("groups").select("id, name, group_members(user_id)").eq("house_id", houseId).order("name"),
  ]);
  if (!house) return { refusal: { code: "42501", message: "not_in_house" } };
  // A house with a list already: the House Pass's assistant. Setting up a new house is free.
  const list = johns && johns.length > 0 ? listAsDraft(johns.map(johnDef), (groups ?? []).map(groupDef)) : null;
  if (list && !passUnlocked(passOf(house), now)) return { refusal: { code: "P0001", message: "pass_needed" } };
  const draftNow = current ?? list;
  const mayEdit = may("johns.add") || may("johns.edit") || may("johns.remove");
  const offline = (): ChatResponse =>
    mayEdit ? offlineTurn(messages, draftNow) : { reply: HOUSE_DRAFT_COPY.offlineAsk, ask: null, draft: null, source: "starter" };

  if (!canDraft() && ask === askClaude) return offline();

  const admin = createAdminClient();
  const { data: turn, error: limit } = await admin.rpc("claim_draft_turn", {
    p_house: houseId,
    p_user: caller.userId,
    p_house_limit: CHAT_TURNS_PER_DAY,
    p_user_limit: CHAT_TURNS_PER_PERSON_PER_DAY,
  });
  if (limit) {
    if (limit.message === "draft_limit") return { refusal: { code: "P0001", message: "draft_limit" } };
    throw new Error(`Couldn't count the day's turns: ${limit.message}`);
  }

  const everyone = (members ?? [])
    .map((m) => ({ userId: m.user_id, name: m.profiles?.display_name ?? "", role: m.role }))
    .filter((p) => p.name);
  // The person writing first: "me" in what they say is them.
  everyone.sort((a, b) => Number(b.userId === caller.userId) - Number(a.userId === caller.userId));
  const people = everyone.map(({ userId, name }) => ({ userId, name }));
  const family = house.kind === "family";
  const rules = rulesOf(house);
  const myRole = everyone.find((p) => p.userId === caller.userId)?.role ?? "member";

  // What the admin might want put right. Without it the chat still drafts.
  let state: ResetState | null = null;
  if (list && may("history.reset")) {
    try {
      state = await resetState(caller, houseId, now);
    } catch (e) {
      console.error("reset_state_failed", e instanceof Error ? e.message : e);
    }
  }

  // The draft Claude changes, a tool call at a time, in draftForModel's words.
  let raw: RawDraft = draftNow ? draftForModel(draftNow, people, caller.userId) : { johns: [], groups: [], note: null };
  let changed = false;
  const resets: ChatReset[] = [];
  const kept = (result: EditResult, next: RawDraft): EditResult => {
    if (result.ok) {
      raw = next;
      changed = true;
    }
    return result;
  };
  const tools: JonzTools = {
    reads: houseReads(caller, houseId, { house: { name: house.name, kind: house.kind, awayMakeup: house.away_makeup }, rules, people: everyone, now }),
    listJohns: () => listLines(raw),
    edit(e) {
      // The tool is only offered to someone who may, but a model's call is checked all the same.
      const need: Permission = e.kind === "add" ? "johns.add" : e.kind === "change" ? "johns.edit" : "johns.remove";
      if (!may(need)) return { ok: false, said: "That isn't something this person can do." };
      const { raw: next, result } = editDraft(raw, e);
      return kept(result, next);
    },
    setGroup(name, groupMembers) {
      if (!may("groups.edit")) return { ok: false, said: "That isn't something this person can do." };
      const named = name.trim();
      if (!named || groupMembers.length === 0) return { ok: false, said: "A group needs a name and someone in it." };
      if ((list?.groups ?? []).some((g) => g.name.toLocaleLowerCase() === named.toLocaleLowerCase())) {
        return { ok: false, said: `The house already has a group called "${named}": its people are changed on the House page.` };
      }
      const others = (raw.groups ?? []).filter((g) => String(g.name).toLocaleLowerCase() !== named.toLocaleLowerCase());
      return kept({ ok: true, said: `Group "${named}" drafted. Put Johns in it with group "${named}", or it won't be made.` }, {
        ...raw,
        groups: [...others, { name: named, members: groupMembers }],
      });
    },
    async offerReset(r) {
      if (!state || !may("history.reset")) return { ok: false, said: "Resets aren't available here." };
      if (resets.length >= CHAT_RESETS_MAX) return { ok: false, said: `That's ${CHAT_RESETS_MAX} already: offer fewer.` };
      const [offered] = await offerResets(caller, houseId, [r], state, now);
      if (!offered) return { ok: false, said: "That doesn't match anything that can be put right: check the refs in house_now." };
      if (resets.some((o) => JSON.stringify(o) === JSON.stringify(offered))) return { ok: true, said: "Already on the card." };
      resets.push(offered);
      return { ok: true, said: "On the card." };
    },
    may: {
      add: may("johns.add"),
      change: may("johns.edit"),
      remove: may("johns.remove"),
      groups: may("groups.edit") && (may("johns.add") || may("johns.edit")),
      resets: state !== null,
    },
  };

  const roleWords = family ? (myRole === "admin" ? "parent" : "kid") : myRole;
  let answer: DraftAnswer;
  try {
    answer = await ask(
      {
        people: people.map((p) => firstName(p.name)),
        me: { name: firstName(people[0]?.name ?? "") || "the person writing", role: roleWords },
        houseName: house.name,
        family,
        weekStarts: rules.weekStarts,
        today: `${new Intl.DateTimeFormat("en-GB", { timeZone: rules.timezone, weekday: "long" }).format(now)} ${localDate(now, rules.timezone)}, ${new Intl.DateTimeFormat("en-GB", { timeZone: rules.timezone, hour: "2-digit", minute: "2-digit" }).format(now)}`,
        allowed: allowed.map((p) => PERMISSIONS[p]).filter(Boolean),
        messages,
        editing: list !== null,
        now: state?.text ?? null,
      },
      tools,
    );
  } catch (e) {
    console.error("draft_failed", e instanceof Error ? e.message : e);
    await admin.from("house_drafts").update({ outcome: "failed" }).eq("id", turn);
    return offline();
  }

  // Only a turn that changed something sends a draft back; null leaves the card as it was.
  const known = { johnIds: (list?.johns ?? []).map((j) => j.id!), groups: list?.groups ?? [] };
  const tidied = changed ? tidyDraft(raw, people, caller.userId, known) : null;
  // A new house's draft with nothing in it is no draft; a list taken down to nothing is a change.
  const draft = tidied && (tidied.johns.length > 0 || list) ? tidied : null;
  await admin
    .from("house_drafts")
    .update({ johns: draft?.johns.length ?? 0, input_tokens: answer.inputTokens, output_tokens: answer.outputTokens })
    .eq("id", turn);
  const reply = tidyReply(answer.raw.reply);
  // Nothing to say and nothing drafted before: a starter list does better than silence.
  if (!reply && !draft && !draftNow && resets.length === 0) return offline();
  return { reply, ask: tidyAsk(answer.raw.ask), draft, source: "ai", ...(resets.length > 0 ? { resets } : {}) };
}
