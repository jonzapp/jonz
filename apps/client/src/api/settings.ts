import {
  CATEGORIES,
  GroupDraft,
  KindDraft,
  kindsInOrder,
  HouseSettings,
  JohnDraft,
  JohnFields,
  johnDef,
  repeatColumns,
  weekIndex,
  weekWindow,
  type Category,
  type DealMode,
  type GroupDef,
  type KindDef,
  type HouseRules,
  type JohnDef,
  type JohnDraftInput,
  type Words,
} from '@app/core';

import type { z } from 'zod';

import { callV1 } from './v1';

// House: the John list, the house rules and who lives here, on /v1. Each is
// a database function that checks the person may (johns:write, roles and
// leaving), so this only shapes what the forms hold. (Renaming yourself is
// profile.ts.)

export interface JohnList {
  johns: JohnDef[];
  /** The house's kinds of John, in their order: the list's sections and each John's lid colour. */
  kinds: KindDef[];
  /** The house's groups, by name, with who is in each: for "Shared by" and for Groups. */
  groups: GroupDef[];
}

/** The house's list of Johns, oldest first, its kinds and its groups. */
export async function loadJohnList(houseId: string): Promise<JohnList> {
  const { johns, kinds, groups } = await callV1('john_list', { houseId });
  return {
    johns: johns.map((j) =>
      johnDef({
        id: j.id,
        name: j.name,
        john_kind_id: j.johnKindId,
        points: j.points,
        every_weeks: j.everyWeeks,
        every_months: j.everyMonths,
        week_of_month: j.weekOfMonth,
        anchor_month: j.anchorMonth,
        anchor_week: j.anchorWeek,
        due_dow: j.dueDow,
        due_time: j.dueTime,
        needs_photo: j.needsPhoto,
        group_id: j.groupId,
        kind: j.kind,
        respond_hours: j.respondHours,
        per_week: j.perWeek,
        crew: j.crew,
        keep_day: j.keepDay,
        pay_minor: j.payMinor,
        min_age: j.minAge,
      }),
    ),
    kinds: kindsInOrder(kinds.map((k): KindDef => ({ ...k, preset: (CATEGORIES as readonly string[]).includes(k.preset ?? '') ? (k.preset as Category) : null }))),
    groups: groups.map((g): GroupDef => ({ id: g.id, name: g.name, memberIds: g.members })),
  };
}

type JohnInput = z.input<typeof JohnFields>;

/** A checked draft as the John functions take it: its repeat counted from now, on call always one person on no kept day. */
function johnInput(draft: JohnDraftInput, rules: HouseRules, now: Date): { id?: string; fields: JohnInput } {
  const parsed = JohnDraft.safeParse(draft);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  // The week a John counts from is set when it's added, and kept.
  const { id, anchorWeek: _kept, kindId, kindName, ...j } = parsed.data;
  const repeat = repeatColumns(j, now, rules.timezone, rules.weekStarts);
  // A kind by name (Ask Jonz's) wins over the one it had. None (null) sends
  // nothing: a new John has no kind, and a changed one keeps the one it had.
  const kind = kindName ? { kindName } : kindId ? { kindId } : {};
  return {
    id,
    fields: {
      ...j,
      ...kind,
      everyWeeks: repeat.every_weeks,
      everyMonths: repeat.every_months,
      weekOfMonth: repeat.week_of_month,
      anchorMonth: repeat.anchor_month,
      // On call is always one person (johns_crew_on_call), and has no day to keep (johns_keep_day_on_call).
      crew: j.when === 'on_call' ? 1 : j.crew,
      keepDay: j.when !== 'on_call' && j.keepDay,
    },
  };
}

/** The week a new John counts from: the house's current one. */
const thisWeek = (rules: HouseRules, now: Date) => weekIndex(weekWindow(now, rules.timezone, rules.weekStarts).startsOn);

/**
 * Add a John, or change one. A new John's cadence counts from the house's
 * current week, as the web's does. Changes apply from the next deal.
 */
export async function saveJohn(houseId: string, rules: HouseRules, draft: JohnDraftInput, now: Date) {
  const { id, fields } = johnInput(draft, rules, now);
  if (id) await callV1('change_john', { ...fields, johnId: id });
  else await callV1('add_john', { ...fields, houseId, anchorWeek: thisWeek(rules, now) });
}

/**
 * Add several Johns at once (a draft an admin kept), each with its group's
 * id or null for everyone. Like saveJohn, their cadence counts from the
 * house's current week. All or nothing.
 */
export async function addJohns(houseId: string, rules: HouseRules, drafts: readonly JohnDraftInput[], now: Date) {
  if (drafts.length === 0) return;
  const anchorWeek = thisWeek(rules, now);
  const johns = drafts.map((draft) => {
    const { fields } = johnInput(draft, rules, now);
    return { ...fields, anchorWeek, payMinor: fields.payMinor ?? 0, minAge: fields.minAge ?? null };
  });
  await callV1('add_johns', { houseId, johns });
}

/** Take a John off the list. Weeks already dealt keep it; the next deal won't. */
export async function archiveJohn(_houseId: string, johnId: string, _now?: Date) {
  await callV1('remove_john', { johnId });
}

/** The house rules, as an admin set them. */
export async function updateHouse(houseId: string, settings: HouseSettings, words: Words) {
  const parsed = HouseSettings.safeParse(settings);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? words('house.rules.check'));
  await callV1('save_house_rules', { ...parsed.data, houseId });
}

/** How the house shares Johns, on its own: Describe your house asks it once a new house has its list (admins only). */
export async function saveDealMode(houseId: string, mode: DealMode) {
  await callV1('set_deal_mode', { houseId, mode });
}

/** Make a housemate an admin, or an admin a housemate. A house always keeps one admin. */
export async function setRole(houseId: string, userId: string, role: 'admin' | 'member') {
  await callV1('set_member_role', { houseId, userId, role });
}

/** Ask someone to leave (admins), or leave yourself (anyone). */
export async function removeMember(houseId: string, userId: string) {
  await callV1('remove_member', { houseId, userId });
}

/** The only admin leaving: make someone else admin, then go, in one step. */
export async function handOver(houseId: string, to: string) {
  await callV1('hand_over', { houseId, toId: to });
}

/** A fresh join code for the house, so the old link stops working: admins only (the database checks). */
export async function resetJoinCode(houseId: string) {
  await callV1('reset_join_code', { houseId });
}

/**
 * Takes the house back to before its first deal, for good: its history, or
 * (everything) its John list, groups, time away and rules too. Admins only
 * (house_reset:write; the database checks).
 */
export async function resetHouseData(houseId: string, everything: boolean) {
  await callV1('reset_house_data', { houseId, everything });
}

/** Make a group, or change who's in one. save_group checks they all live here. */
export async function saveGroup(houseId: string, draft: Omit<GroupDraft, 'id'> & { id?: string }) {
  const parsed = GroupDraft.safeParse(draft);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  // A new group has no id yet; save_group makes one.
  await callV1('save_group', { houseId, groupId: parsed.data.id ?? null, name: parsed.data.name, members: parsed.data.members });
}

/** Delete a group. Its Johns go back to the whole house. */
export async function deleteGroup(groupId: string) {
  await callV1('delete_group', { groupId });
}

/** Make a kind of John (no id) or rename and recolour one; gives its id. */
export async function saveKind(houseId: string, kindId: string | null, draft: KindDraft): Promise<string> {
  const parsed = KindDraft.safeParse(draft);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return callV1('save_kind', { houseId, kindId, ...parsed.data });
}

/** Put the house's kinds in this order. */
export async function orderKinds(houseId: string, kinds: readonly string[]) {
  await callV1('order_kinds', { houseId, kinds: [...kinds] });
}

/** Delete a kind; its Johns move to `moveToId`, or to Everything else. */
export async function deleteKind(kindId: string, moveToId?: string) {
  await callV1('delete_kind', { kindId, ...(moveToId ? { moveToId } : {}) });
}

/** Hand out this week's Johns, or re-deal a week nobody has ticked in: admins only (the server checks). */
export async function dealThisWeek(houseId: string) {
  await callV1('deal_week', { houseId });
}

/**
 * An admin picks who lives here (Rules). Returns the day it changes when it
 * waits for the 1st, or null when it changed at once (or a waiting change was
 * kept as it is).
 */
export async function setHouseKind(houseId: string, kind: 'housemates' | 'family'): Promise<string | null> {
  return callV1('set_house_kind', { houseId, kind });
}
