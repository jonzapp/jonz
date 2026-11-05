import {
  ChatResponse,
  draftChanges,
  draftPlan,
  offlineTurn,
  type ChatMessage,
  type GroupDef,
  type HouseDraft,
  type HouseRules,
} from '@app/core';

import { apiPost, ApiRequestError } from './http';
import { addJohns, archiveJohn, saveGroup, saveJohn, type JohnList } from './settings';
import { supabase } from './supabase';

// Ask Jonz and Describe your house: one turn of the chat with apps/api
// (Claude, or a starter list when Claude isn't there), then apply the changes
// an admin kept.
// Keeping goes through the John list's own grants and save_group, exactly as
// adding Johns and groups by hand does; the draft itself is never stored.

/**
 * Jonz's answer to the chat so far, with the draft as it stands. A refusal
 * (not in the house, too many turns today) throws its sentence; if the API
 * can't be reached at all, offlineTurn answers here as the API would
 * (a starter list that fits, or the draft left as it is), so setting up a
 * house never stops here.
 */
export async function sendChat(houseId: string, messages: readonly ChatMessage[], draft: HouseDraft | null): Promise<ChatResponse> {
  try {
    return await apiPost('/api/setup/draft', { houseId, messages, draft }, ChatResponse);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status >= 400 && e.status < 500 && e.status !== 404) throw e;
    return offlineTurn(messages, draft);
  }
}

/**
 * Add the kept Johns (by their place in the draft) to the house's list,
 * making the groups they need first. Returns how many were added.
 */
export async function keepDraft(
  houseId: string,
  rules: HouseRules,
  draft: HouseDraft,
  keep: readonly number[],
  groups: readonly GroupDef[],
  now: Date,
): Promise<number> {
  return applyDraft(houseId, rules, null, draft, keep.map((i) => `add:${i}`), { johns: [], groups: [...groups] }, now);
}

/**
 * Apply the changes an admin ticked (draftChanges' keys) of a draft made
 * from the list `base`: make the groups they need, add the new Johns, save
 * the changed ones over what's there, and take the rest off. Each goes
 * through the list's own writes, as if by hand. Returns how many applied.
 */
export async function applyDraft(
  houseId: string,
  rules: HouseRules,
  base: HouseDraft | null,
  draft: HouseDraft,
  keys: readonly string[],
  list: JohnList,
  now: Date,
): Promise<number> {
  const picked = draftChanges(base, draft).filter((c) => keys.includes(c.key));
  const at = picked.flatMap((c) => (c.kind === 'remove' ? [] : [c.at])).sort((a, b) => a - b);
  const plan = draftPlan(draft, at, list.groups);
  for (const group of plan.makeGroups) await saveGroup(houseId, group);
  let ids = new Map(list.groups.map((g) => [g.name, g.id]));
  if (plan.makeGroups.length > 0) {
    const { data, error } = await supabase.from('groups').select('id, name').eq('house_id', houseId);
    if (error) throw error;
    ids = new Map((data ?? []).map((g) => [g.name, g.id]));
  }
  // draftPlan keeps the draft's order, so its Johns line up with `at`.
  const planned = new Map(at.map((i, n) => [i, plan.johns[n]]));
  const written = (i: number) => {
    const { john, groupName } = planned.get(i)!;
    return { ...john, groupId: groupName ? (ids.get(groupName) ?? null) : null };
  };
  await addJohns(
    houseId,
    rules,
    picked.flatMap((c) => (c.kind === 'add' ? [written(c.at)] : [])),
    now,
  );
  for (const c of picked) {
    if (c.kind === 'change') {
      const was = list.johns.find((j) => j.id === c.john.id);
      // What the chat doesn't know about (keeps its day, pocket money, age) stays as it was.
      const next = written(c.at);
      if (was) await saveJohn(houseId, rules, { ...was, ...next, keepDay: next.when === 'on_call' ? false : was.keepDay, id: was.id }, now);
    } else if (c.kind === 'remove' && c.before.id) {
      await archiveJohn(houseId, c.before.id, now);
    }
  }
  return picked.length;
}
