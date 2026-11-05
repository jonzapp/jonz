import "server-only";

import {
  CHAT_TURNS_PER_DAY,
  CHAT_TURNS_PER_PERSON_PER_DAY,
  draftForModel,
  firstName,
  groupDef,
  johnDef,
  listAsDraft,
  offlineTurn,
  passOf,
  passUnlocked,
  tidyAsk,
  tidyDraft,
  type ChatMessage,
  type ChatResponse,
  type HouseDraft,
  type IsoDow,
} from "@app/core";

import { askClaude, canDraft, type DraftAnswer, type DraftContext } from "@/lib/ai/house-draft";
import { createAdminClient } from "@/lib/supabase/admin";

import { offerResets, resetState, type ResetState } from "./ask-resets";
import type { Caller, Refusal } from "./disputes";
import { permitted } from "./permitted";

/** The most Jonz says in one turn, so a runaway reply can't fill the screen. */
const REPLY_MAX = 600;

/**
 * One turn of the chat with Jonz. An admin's message (and the chat before
 * it, and the draft as it stands) in; Jonz's reply, a question to tap an
 * answer to, and the new draft out. A new house's chat drafts its first
 * list, free; a house with a list already starts from that list and changes
 * it, which is the House Pass's (`pass_needed` without it). Only an admin of
 * the house may ask (the list is theirs to change), and a house gets
 * CHAT_TURNS_PER_DAY turns from Claude a day, a person
 * CHAT_TURNS_PER_PERSON_PER_DAY. Each turn is written down before Claude is
 * asked (claim_draft_turn), so turns sent together can't all slip under the
 * limit. When Claude isn't set up or
 * doesn't answer, offlineTurn answers (a starter list that fits, or the
 * draft left as it is), so setup never stops here. Nothing is written to the
 * John list: the admin keeps what they want of the draft through the list's
 * own grants. For a house that's running, Jonz also hears the last two weeks
 * and what can be undone, and can offer resets (lib/moves/ask-resets.ts):
 * those too only happen when the admin taps them.
 *
 * `ask` is Claude, unless a test stands in for it.
 */
export async function chatTurn(
  caller: Caller,
  houseId: string,
  messages: readonly ChatMessage[],
  current: HouseDraft | null,
  now: Date,
  ask: (ctx: DraftContext) => Promise<DraftAnswer> = askClaude,
): Promise<{ refusal: Refusal } | ChatResponse> {
  // Drafting and changing the list is for whoever may change it (an admin today).
  const refused = await permitted(caller, houseId, "johns.edit");
  if (refused) return { refusal: refused };

  const [{ data: house }, { data: members }, { data: johns }, { data: groups }] = await Promise.all([
    caller.db.from("houses").select("week_starts, pass_plan, pass_until, pass_buyer").eq("id", houseId).single(),
    caller.db.from("members").select("user_id, joined_at, profiles(display_name)").eq("house_id", houseId).order("joined_at"),
    caller.db
      .from("johns")
      .select("id, name, category, points, every_weeks, every_months, week_of_month, anchor_month, due_dow, due_time, needs_photo, group_id, kind, respond_hours, per_week, crew")
      .eq("house_id", houseId)
      .is("archived_at", null)
      .order("created_at"),
    caller.db.from("groups").select("id, name, group_members(user_id)").eq("house_id", houseId).order("name"),
  ]);
  // A house with a list already changes it: the House Pass's assistant. Setting up a new house is free.
  const list = johns && johns.length > 0 ? listAsDraft(johns.map(johnDef), (groups ?? []).map(groupDef)) : null;
  if (list && house && !passUnlocked(passOf(house), now)) return { refusal: { code: "P0001", message: "pass_needed" } };
  const draftNow = current ?? list;

  if (!canDraft() && ask === askClaude) return offlineTurn(messages, draftNow);

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

  const people = (members ?? []).map((m) => ({ userId: m.user_id, name: m.profiles?.display_name ?? "" })).filter((p) => p.name);
  // The person writing first: "me" in what they say is them.
  people.sort((a, b) => Number(b.userId === caller.userId) - Number(a.userId === caller.userId));

  // What the admin might want put right. Without it the chat still drafts.
  let state: ResetState | null = null;
  if (list) {
    try {
      state = await resetState(caller, houseId, now);
    } catch (e) {
      console.error("reset_state_failed", e instanceof Error ? e.message : e);
    }
  }

  let answer: DraftAnswer;
  try {
    answer = await ask({
      people: people.map((p) => firstName(p.name)),
      weekStarts: (house?.week_starts ?? 1) as IsoDow,
      messages,
      draft: draftNow ? draftForModel(draftNow, people, caller.userId) : null,
      editing: list !== null,
      now: state?.text ?? null,
    });
  } catch (e) {
    console.error("draft_failed", e instanceof Error ? e.message : e);
    await admin.from("house_drafts").update({ outcome: "failed" }).eq("id", turn);
    return offlineTurn(messages, draftNow);
  }

  // A draft with nothing in it (the message wasn't about a house) leaves the draft as it was.
  const known = { johnIds: (list?.johns ?? []).map((j) => j.id!), groups: list?.groups ?? [] };
  const tidied = answer.raw.draft ? tidyDraft(answer.raw.draft, people, caller.userId, known) : null;
  const draft = tidied && tidied.johns.length > 0 ? tidied : null;
  await admin
    .from("house_drafts")
    .update({ johns: draft?.johns.length ?? 0, input_tokens: answer.inputTokens, output_tokens: answer.outputTokens })
    .eq("id", turn);
  const reply = answer.raw.reply.replace(/\s+/g, " ").trim().slice(0, REPLY_MAX);
  // Nothing to say and nothing drafted before: a starter list does better than silence.
  if (!reply && !draft && !draftNow) return offlineTurn(messages, draftNow);
  const resets = state && answer.raw.resets?.length ? await offerResets(caller, houseId, answer.raw.resets, state, now) : [];
  return { reply, ask: tidyAsk(answer.raw.ask), draft, source: "ai", ...(resets.length > 0 ? { resets } : {}) };
}
