import { NEW_JOHN, weekIndex, weekWindow, type HouseRules, type HouseSettings, wordsFor } from '@app/core';

import {
  addJohns,
  archiveJohn,
  dealThisWeek,
  deleteGroup,
  handOver,
  loadJohnList,
  removeMember,
  resetJoinCode,
  saveDealMode,
  saveGroup,
  saveJohn,
  setHouseKind,
  setRole,
  updateHouse,
} from './settings';
import { callV1 } from './v1';

const words = wordsFor('en', 'housemates');

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;
const RULES: HouseRules = {
  timezone: 'Europe/London',
  currency: 'GBP',
  weekStarts: 1,
  stakeMinor: 2000,
  lateForfeitMinor: 100,
  missedForfeitMinor: 300,
  disputeHours: 24,
  coverGraceHours: 3,
  lateHours: 24,
  dealMode: 'smart',
  dealBudget: 4,
};
const NOW = new Date('2026-10-21T12:00:00Z');
const H1 = '00000000-0000-4000-8000-0000000000b1';
const THIS_WEEK = weekIndex(weekWindow(NOW, 'Europe/London', 1).startsOn);
/** The input of the last call to `name`. */
const lastInput = (name: string) => call.mock.calls.filter(([n]) => n === name).at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  call.mockResolvedValue(null);
});

describe('loadJohnList', () => {
  it("reads the house's live Johns, as House shows them, its kinds and its groups", async () => {
    call.mockResolvedValue({
      johns: [
        {
          id: 'j1',
          name: 'Bins',
          johnKindId: 'k-bins',
          category: 'bins',
          points: 2,
          everyWeeks: 1,
          everyMonths: null,
          weekOfMonth: null,
          anchorMonth: null,
          anchorWeek: 2900,
          dueDow: 7,
          dueTime: '21:00:00',
          needsPhoto: false,
          groupId: 'g1',
          kind: 'day',
          respondHours: 12,
          perWeek: 2,
          crew: 1,
          keepDay: false,
          payMinor: 0,
          minAge: null,
        },
      ],
      kinds: [
        { id: 'k-garden', name: 'Garden', colour: '#4f9a2e', position: 1, preset: null },
        { id: 'k-bins', name: 'Bins', colour: '#2a2d30', position: 0, preset: 'bins' },
      ],
      groups: [{ id: 'g1', name: 'Upstairs', members: ['ava'] }],
    });
    await expect(loadJohnList(H1)).resolves.toEqual({
      johns: [
        {
          id: 'j1',
          name: 'Bins',
          kindId: 'k-bins',
          category: 'bins',
          points: 2,
          everyWeeks: 1,
          everyMonths: null,
          weekOfMonth: null,
          anchorMonth: null,
          anchorWeek: 2900,
          dueDow: 7,
          dueTime: '21:00',
          needsPhoto: false,
          groupId: 'g1',
          when: 'day',
          respondHours: 12,
          perWeek: 2,
          crew: 1,
          keepDay: false,
          payMinor: 0,
          minAge: null,
        },
      ],
      // In the house's order.
      kinds: [
        { id: 'k-bins', name: 'Bins', colour: '#2a2d30', position: 0, preset: 'bins' },
        { id: 'k-garden', name: 'Garden', colour: '#4f9a2e', position: 1, preset: null },
      ],
      groups: [{ id: 'g1', name: 'Upstairs', memberIds: ['ava'] }],
    });
    expect(call).toHaveBeenCalledWith('john_list', { houseId: H1 });
  });
});

describe('saveJohn', () => {
  it("adds a John whose cadence counts from the house's current week", async () => {
    await saveJohn(H1, RULES, { ...NEW_JOHN, name: ' Hob ', dueTime: '18:30' }, NOW);
    expect(lastInput('add_john')).toEqual({
      houseId: H1,
      anchorWeek: THIS_WEEK,
      name: 'Hob',
      category: 'kitchen',
      points: 2,
      everyWeeks: 1,
      everyMonths: null,
      weekOfMonth: null,
      anchorMonth: null,
      dueDow: 7,
      dueTime: '18:30',
      needsPhoto: false,
      groupId: null,
      when: 'day',
      respondHours: 12,
      perWeek: 2,
      crew: 1,
      keepDay: false,
      payMinor: 0,
      minAge: null,
    });
  });

  it('writes an on-call John as one person on no kept day', async () => {
    await saveJohn(H1, RULES, { ...NEW_JOHN, name: 'Bins', when: 'on_call', respondHours: 8, perWeek: 3, crew: 3, keepDay: true }, NOW);
    expect(lastInput('add_john')).toMatchObject({ when: 'on_call', respondHours: 8, perWeek: 3, crew: 1, keepDay: false });
  });

  it('starts a John that repeats in months in the first month it lands from next week', async () => {
    // Every 3 months on the first Saturday: next week is 26 Oct, so the first is Sat 7 Nov.
    await saveJohn(H1, RULES, { ...NEW_JOHN, name: 'Fridge', everyWeeks: 4, everyMonths: 3, weekOfMonth: 1, dueDow: 6 }, NOW);
    expect(lastInput('add_john')).toMatchObject({ everyWeeks: 1, everyMonths: 3, weekOfMonth: 1, anchorMonth: 2026 * 12 + 10 });
  });

  it('changes a John by its id, keeping its month and never its week', async () => {
    const id = crypto.randomUUID();
    const fridge = { ...NEW_JOHN, id, name: 'Fridge', everyMonths: 3, weekOfMonth: 1, anchorMonth: 2026 * 12 + 11, anchorWeek: 2800, dueDow: 6 as const };
    await saveJohn(H1, RULES, fridge, NOW);
    expect(lastInput('change_john')).toMatchObject({ johnId: id, everyMonths: 3, weekOfMonth: 1, anchorMonth: 2026 * 12 + 11 });
    expect(lastInput('change_john')).not.toHaveProperty('anchorWeek');
    await saveJohn(H1, RULES, { ...fridge, everyWeeks: 2, everyMonths: null, weekOfMonth: null }, NOW);
    expect(lastInput('change_john')).toMatchObject({ everyWeeks: 2, everyMonths: null, weekOfMonth: null, anchorMonth: null });
    expect(call.mock.calls.map(([n]) => n)).toEqual(['change_john', 'change_john']);
  });

  it('writes a John read with its kind by that kind alone, and leaves one with no kind without one', async () => {
    const id = crypto.randomUUID();
    const garden = crypto.randomUUID();
    await saveJohn(H1, RULES, { ...NEW_JOHN, id, name: 'Lawn', kindId: garden, category: 'other' }, NOW);
    expect(lastInput('change_john')).toMatchObject({ johnId: id, kindId: garden });
    expect(lastInput('change_john')).not.toHaveProperty('category');
    // Its kind was deleted: sending its older category would put it in Everything else.
    await saveJohn(H1, RULES, { ...NEW_JOHN, id, name: 'Lawn', kindId: null, category: 'other' }, NOW);
    expect(lastInput('change_john')).not.toHaveProperty('category');
    expect(lastInput('change_john')).not.toHaveProperty('kindId');
  });

  it("moves a John to Ask Jonz's kind by name, over the kind it had", async () => {
    const id = crypto.randomUUID();
    await saveJohn(H1, RULES, { ...NEW_JOHN, id, name: 'Lawn', kindId: crypto.randomUUID(), kindName: 'Garden', category: 'other' }, NOW);
    expect(lastInput('change_john')).toMatchObject({ johnId: id, kindName: 'Garden' });
    expect(lastInput('change_john')).not.toHaveProperty('kindId');
    expect(lastInput('change_john')).not.toHaveProperty('category');
  });

  it("says what's wrong before asking the API", async () => {
    await expect(saveJohn(H1, RULES, { ...NEW_JOHN, name: ' ' }, NOW)).rejects.toThrow('Name the John.');
    await expect(saveJohn(H1, RULES, { ...NEW_JOHN, name: 'Hob', dueTime: '9pm' }, NOW)).rejects.toThrow('Give a time like 21:00.');
    expect(call).not.toHaveBeenCalled();
  });

  it("passes on the API's refusal", async () => {
    call.mockRejectedValue(new Error('Only the house admins can do that.'));
    await expect(saveJohn(H1, RULES, { ...NEW_JOHN, name: 'Hob' }, NOW)).rejects.toThrow('Only the house admins can do that.');
  });
});

describe('addJohns', () => {
  it('adds a kept draft in one call, each from this week', async () => {
    await addJohns(H1, RULES, [{ ...NEW_JOHN, name: 'Hob' }, { ...NEW_JOHN, name: 'Bins', payMinor: 50 }], NOW);
    const { houseId, johns } = lastInput('add_johns') as { houseId: string; johns: Record<string, unknown>[] };
    expect(houseId).toBe(H1);
    expect(johns.map((j) => [j.name, j.anchorWeek, j.payMinor, j.minAge])).toEqual([
      ['Hob', THIS_WEEK, 0, null],
      ['Bins', THIS_WEEK, 50, null],
    ]);
  });

  it('asks nothing for an empty draft', async () => {
    await addJohns(H1, RULES, [], NOW);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('updateHouse', () => {
  const settings: HouseSettings = {
    name: 'Flat 3',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    weekStarts: 7,
    stakeMinor: 1500,
    lateForfeitMinor: 50,
    missedForfeitMinor: 250,
    disputeHours: 48,
    awayMakeup: 50,
  };

  it('saves the rules, as the form holds them', async () => {
    await updateHouse(H1, { ...settings, dealMode: 'classic', dealBudget: 2 }, words);
    expect(call).toHaveBeenCalledWith('save_house_rules', { ...settings, dealMode: 'classic', dealBudget: 2, houseId: H1 });
  });

  it('says what is wrong with the rules first', async () => {
    await expect(updateHouse(H1, { ...settings, name: '' }, words)).rejects.toThrow('Give the house a name.');
    await expect(updateHouse(H1, { ...settings, stakeMinor: -1 }, words)).rejects.toThrow('Amounts can’t be negative.');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('the rest of House', () => {
  const ava = crypto.randomUUID();
  const ben = crypto.randomUUID();

  it.each([
    ['remove_john', () => archiveJohn(H1, 'j1', NOW), { johnId: 'j1' }],
    ['set_deal_mode', () => saveDealMode(H1, 'classic'), { houseId: H1, mode: 'classic' }],
    ['set_member_role', () => setRole(H1, ava, 'admin'), { houseId: H1, userId: ava, role: 'admin' }],
    ['remove_member', () => removeMember(H1, ava), { houseId: H1, userId: ava }],
    ['hand_over', () => handOver(H1, ava), { houseId: H1, toId: ava }],
    ['reset_join_code', () => resetJoinCode(H1), { houseId: H1 }],
    ['save_group', () => saveGroup(H1, { name: ' Upstairs ', members: [ava, ben] }), { houseId: H1, groupId: null, name: 'Upstairs', members: [ava, ben] }],
    ['delete_group', () => deleteGroup('g1'), { groupId: 'g1' }],
    ['deal_week', () => dealThisWeek(H1), { houseId: H1 }],
    ['set_house_kind', () => setHouseKind(H1, 'family'), { houseId: H1, kind: 'family' }],
  ])('runs %s on /v1', async (name, run, input) => {
    await run();
    expect(call).toHaveBeenCalledWith(name, input);
  });

  it("says what's missing from a group before asking", async () => {
    await expect(saveGroup(H1, { name: 'Upstairs', members: [] })).rejects.toThrow('Pick at least one person.');
    expect(call).not.toHaveBeenCalled();
  });

  it('answers the day a house kind waits for', async () => {
    call.mockResolvedValue('2026-11-01');
    await expect(setHouseKind(H1, 'family')).resolves.toBe('2026-11-01');
  });
});
