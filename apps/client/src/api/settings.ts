import {
  GroupDraft,
  groupDef,
  HouseSettings,
  humanError,
  JohnDraft,
  johnDef,
  MoveResponse,
  repeatColumns,
  RULES_COPY,
  weekIndex,
  weekWindow,
  type DealMode,
  type GroupDef,
  type HouseRules,
  type JohnDef,
  type JohnDraftInput,
} from '@app/core';

import { apiPost } from './http';
import { supabase } from './supabase';

// House: the John list, the house rules and who lives here, read and written
// through your own session. Admins write the list and the rules through the
// columns granted to them; roles and leaving go through set_member_role and
// remove_member; the deal needs the server (POST /api/deal). RLS and those
// functions decide; this only translates. (Renaming yourself is profile.ts.)

export interface JohnList {
  johns: JohnDef[];
  /** The house's groups, by name, with who is in each: for "Shared by" and for Groups. */
  groups: GroupDef[];
}

/** The house's list of Johns, oldest first, and its groups. */
export async function loadJohnList(houseId: string): Promise<JohnList> {
  const [johns, groups] = await Promise.all([
    supabase
      .from('johns')
      .select(
        'id, name, category, points, every_weeks, every_months, week_of_month, anchor_month, anchor_week, due_dow, due_time, needs_photo, group_id, kind, respond_hours, per_week, crew, keep_day, pay_minor',
      )
      .eq('house_id', houseId)
      .is('archived_at', null)
      .order('created_at'),
    supabase.from('groups').select('id, name, group_members(user_id)').eq('house_id', houseId).order('name'),
  ]);
  if (johns.error) throw johns.error;
  if (groups.error) throw groups.error;
  return { johns: (johns.data ?? []).map(johnDef), groups: (groups.data ?? []).map(groupDef) };
}

/**
 * RLS lets only an admin's write through, and filters anyone else's to no
 * rows rather than refusing it, so a write that reached nothing wasn't
 * theirs to make.
 */
function wrote(result: { data: unknown[] | null; error: { message?: string; code?: string } | null }) {
  if (result.error) throw new Error(humanError(result.error));
  if (!result.data?.length) throw new Error(humanError({ message: 'admins_only' }));
}

/**
 * Add a John, or change one. A new John's cadence counts from the house's
 * current week, as the web's does. Changes apply from the next deal.
 */
export async function saveJohn(houseId: string, rules: HouseRules, draft: JohnDraftInput, now: Date) {
  const parsed = JohnDraft.safeParse(draft);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const j = parsed.data;
  const fields = {
    name: j.name,
    category: j.category,
    points: j.points,
    ...repeatColumns(j, now, rules.timezone, rules.weekStarts),
    due_dow: j.dueDow,
    due_time: j.dueTime,
    needs_photo: j.needsPhoto,
    group_id: j.groupId,
    kind: j.when,
    respond_hours: j.respondHours,
    per_week: j.perWeek,
    // On call is always one person (johns_crew_on_call), and has no day to keep (johns_keep_day_on_call).
    crew: j.when === 'on_call' ? 1 : j.crew,
    keep_day: j.when !== 'on_call' && j.keepDay,
    ...(j.payMinor === undefined ? {} : { pay_minor: j.payMinor }),
  };
  wrote(
    j.id
      ? await supabase.from('johns').update(fields).eq('id', j.id).eq('house_id', houseId).select('id')
      : await supabase
          .from('johns')
          .insert({
            ...fields,
            house_id: houseId,
            anchor_week: weekIndex(weekWindow(now, rules.timezone, rules.weekStarts).startsOn),
          })
          .select('id'),
  );
}

/**
 * Add several Johns at once (a draft an admin kept), each with its group's
 * id or null for everyone. Like saveJohn, their cadence counts from the
 * house's current week. All or nothing: one insert.
 */
export async function addJohns(
  houseId: string,
  rules: HouseRules,
  drafts: readonly JohnDraftInput[],
  now: Date,
) {
  if (drafts.length === 0) return;
  const anchor = weekIndex(weekWindow(now, rules.timezone, rules.weekStarts).startsOn);
  const rows = drafts.map((draft) => {
    const parsed = JohnDraft.safeParse(draft);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const j = parsed.data;
    return {
      house_id: houseId,
      anchor_week: anchor,
      name: j.name,
      category: j.category,
      points: j.points,
      ...repeatColumns(j, now, rules.timezone, rules.weekStarts),
      due_dow: j.dueDow,
      due_time: j.dueTime,
      needs_photo: j.needsPhoto,
      group_id: j.groupId,
      kind: j.when,
      respond_hours: j.respondHours,
      per_week: j.perWeek,
      crew: j.when === 'on_call' ? 1 : j.crew,
      keep_day: j.when !== 'on_call' && j.keepDay,
      // Every row names every column: a bulk insert fills one left out with null.
      pay_minor: j.payMinor ?? 0,
    };
  });
  wrote(await supabase.from('johns').insert(rows).select('id'));
}

/** Take a John off the list. Weeks already dealt keep it; the next deal won't. */
export async function archiveJohn(houseId: string, johnId: string, now: Date) {
  wrote(
    await supabase
      .from('johns')
      .update({ archived_at: now.toISOString() })
      .eq('id', johnId)
      .eq('house_id', houseId)
      .select('id'),
  );
}

/** The house rules, as an admin set them. */
export async function updateHouse(houseId: string, settings: HouseSettings) {
  const parsed = HouseSettings.safeParse(settings);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? RULES_COPY.check);
  const s = parsed.data;
  wrote(
    await supabase
      .from('houses')
      .update({
        name: s.name,
        timezone: s.timezone,
        currency: s.currency,
        week_starts: s.weekStarts,
        stake_minor: s.stakeMinor,
        late_forfeit_minor: s.lateForfeitMinor,
        missed_forfeit_minor: s.missedForfeitMinor,
        dispute_hours: s.disputeHours,
        ...(s.coverGraceHours === undefined ? {} : { cover_grace_hours: s.coverGraceHours }),
        ...(s.lateHours === undefined ? {} : { late_hours: s.lateHours }),
        away_makeup: s.awayMakeup,
        ...(s.settleIn === undefined ? {} : { settle_in: s.settleIn }),
        ...(s.dealMode === undefined ? {} : { deal_mode: s.dealMode }),
        ...(s.dealBudget === undefined ? {} : { deal_budget: s.dealBudget }),
        ...(s.pocketCapMinor === undefined ? {} : { pocket_cap_minor: s.pocketCapMinor }),
      })
      .eq('id', houseId)
      .select('id'),
  );
}

/** How the house shares Johns, on its own: Describe your house asks it once a new house has its list (admins only, as RLS says). */
export async function saveDealMode(houseId: string, mode: DealMode) {
  wrote(await supabase.from('houses').update({ deal_mode: mode }).eq('id', houseId).select('id'));
}

/** Make a housemate an admin, or an admin a housemate. A house always keeps one admin. */
export async function setRole(houseId: string, userId: string, role: 'admin' | 'member') {
  const { error } = await supabase.rpc('set_member_role', { p_house: houseId, p_user: userId, p_role: role });
  if (error) throw new Error(humanError(error));
}

/** Ask someone to leave (admins), or leave yourself (anyone). */
export async function removeMember(houseId: string, userId: string) {
  const { error } = await supabase.rpc('remove_member', { p_house: houseId, p_user: userId });
  if (error) throw new Error(humanError(error));
}

/** The only admin leaving: make someone else admin, then go, in one step. */
export async function handOver(houseId: string, to: string) {
  const { error } = await supabase.rpc('hand_over', { p_house: houseId, p_to: to });
  if (error) throw new Error(humanError(error));
}

/** A fresh join code for the house, so the old link stops working: admins only (the database checks). */
export async function resetJoinCode(houseId: string) {
  const { error } = await supabase.rpc('reset_join_code', { p_house: houseId });
  if (error) throw new Error(humanError(error));
}

/** Make a group, or change who's in one. save_group checks they all live here. */
export async function saveGroup(houseId: string, draft: Omit<GroupDraft, 'id'> & { id?: string }) {
  const parsed = GroupDraft.safeParse(draft);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { error } = await supabase.rpc('save_group', {
    p_house: houseId,
    // A new group has no id yet; save_group makes one.
    p_group: (parsed.data.id ?? null) as string,
    p_name: parsed.data.name,
    p_members: parsed.data.members,
  });
  if (error) throw new Error(humanError(error));
}

/** Delete a group. Its Johns go back to the whole house. */
export async function deleteGroup(groupId: string) {
  const { error } = await supabase.rpc('delete_group', { p_group: groupId });
  if (error) throw new Error(humanError(error));
}

/** Hand out this week's Johns, or re-deal a week nobody has ticked in: admins only (the server checks). */
export async function dealThisWeek(houseId: string) {
  await apiPost('/api/deal', { houseId }, MoveResponse);
}
