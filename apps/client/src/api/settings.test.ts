import { MoveResponse, NEW_JOHN, weekIndex, weekWindow, type HouseRules, type HouseSettings } from '@app/core';

import { apiPost } from './http';
import {
  archiveJohn,
  dealThisWeek,
  deleteGroup,
  loadJohnList,
  removeMember,
  saveDealMode,
  saveGroup,
  saveJohn,
  setRole,
  updateHouse,
} from './settings';
import { supabase } from './supabase';

const mockAnswers: Record<string, { data: unknown; error: unknown }> = {};
const mockCalls: [string, string, unknown[]][] = [];

jest.mock('./http', () => ({ apiPost: jest.fn() }));
jest.mock('./supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'insert', 'update', 'eq', 'is', 'order']) {
        builder[method] = jest.fn((...args: unknown[]) => {
          mockCalls.push([table, method, args]);
          return builder;
        });
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(mockAnswers[table] ?? { data: [{ id: 'x' }], error: null }).then(resolve, reject);
      return builder;
    }),
  },
}));

const rpc = supabase.rpc as unknown as jest.Mock;
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
const callsOf = (table: string, method: string) => mockCalls.filter(([t, m]) => t === table && m === method).map(([, , a]) => a);

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  for (const key of Object.keys(mockAnswers)) delete mockAnswers[key];
});

describe('loadJohnList', () => {
  it("reads the house's live Johns, as House shows them, and its groups", async () => {
    mockAnswers.johns = {
      data: [
        {
          id: 'j1',
          name: 'Bins',
          category: 'bins',
          points: 2,
          every_weeks: 1,
          due_dow: 7,
          due_time: '21:00:00',
          needs_photo: false,
          group_id: 'g1',
        },
      ],
      error: null,
    };
    mockAnswers.groups = { data: [{ id: 'g1', name: 'Upstairs', group_members: [{ user_id: 'ava' }] }], error: null };
    const list = await loadJohnList('h1');
    expect(list).toEqual({
      johns: [
        {
          id: 'j1',
          name: 'Bins',
          category: 'bins',
          points: 2,
          everyWeeks: 1,
          dueDow: 7,
          dueTime: '21:00',
          needsPhoto: false,
          groupId: 'g1',
          when: 'day',
          respondHours: 12,
          perWeek: 2,
          everyMonths: null,
          weekOfMonth: null,
          anchorMonth: null,
          crew: 1,
          keepDay: false,
          payMinor: 0,
        },
      ],
      groups: [{ id: 'g1', name: 'Upstairs', memberIds: ['ava'] }],
    });
    expect(callsOf('johns', 'eq')).toEqual([['house_id', 'h1']]);
    expect(callsOf('johns', 'is')).toEqual([['archived_at', null]]);
  });

  it('throws what the database said', async () => {
    mockAnswers.groups = { data: null, error: { message: 'offline' } };
    await expect(loadJohnList('h1')).rejects.toEqual({ message: 'offline' });
  });
});

describe('saveJohn', () => {
  it('writes an on-call John with its window and how often it needs doing', async () => {
    await saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Bins', when: 'on_call', respondHours: 8, perWeek: 3 }, NOW);
    const [[row]] = callsOf('johns', 'insert') as [[Record<string, unknown>]];
    expect(row).toMatchObject({ name: 'Bins', kind: 'on_call', respond_hours: 8, per_week: 3 });
  });

  it('writes Keep its day, and never on an on-call John', async () => {
    await saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Bins', keepDay: true }, NOW);
    await saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Dishes', when: 'on_call', keepDay: true }, NOW);
    const rows = (callsOf('johns', 'insert') as [Record<string, unknown>][]).map(([row]) => row);
    expect(rows.map((r) => r.keep_day)).toEqual([true, false]);
  });

  it("adds a John whose cadence counts from the house's current week", async () => {
    await saveJohn('h1', RULES, { ...NEW_JOHN, name: ' Hob ', dueTime: '18:30' }, NOW);
    const [[row]] = callsOf('johns', 'insert') as [[Record<string, unknown>]];
    expect(row).toEqual({
      name: 'Hob',
      category: 'kitchen',
      points: 2,
      every_weeks: 1,
      every_months: null,
      week_of_month: null,
      anchor_month: null,
      due_dow: 7,
      due_time: '18:30',
      needs_photo: false,
      group_id: null,
      kind: 'day',
      respond_hours: 12,
      per_week: 2,
      crew: 1,
      keep_day: false,
      pay_minor: 0,
      house_id: 'h1',
      anchor_week: weekIndex(weekWindow(NOW, 'Europe/London', 1).startsOn),
    });
    expect(callsOf('johns', 'update')).toEqual([]);
  });

  it('starts a John that repeats in months in the first month it lands from next week', async () => {
    // Every 3 months on the first Saturday: next week is 26 Oct, so the first is Sat 7 Nov.
    await saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Fridge', everyWeeks: 4, everyMonths: 3, weekOfMonth: 1, dueDow: 6 }, NOW);
    const [[row]] = callsOf('johns', 'insert') as [[Record<string, unknown>]];
    expect(row).toMatchObject({ every_weeks: 1, every_months: 3, week_of_month: 1, anchor_month: 2026 * 12 + 10 });
  });

  it('keeps the month a John that repeats in months counts from, and clears it going back to weeks', async () => {
    const id = crypto.randomUUID();
    const fridge = { ...NEW_JOHN, id, name: 'Fridge', everyMonths: 3, weekOfMonth: 1, anchorMonth: 2026 * 12 + 11, dueDow: 6 as const };
    await saveJohn('h1', RULES, fridge, NOW);
    expect(callsOf('johns', 'update')[0][0]).toMatchObject({ every_months: 3, week_of_month: 1, anchor_month: 2026 * 12 + 11 });
    await saveJohn('h1', RULES, { ...fridge, everyWeeks: 2, everyMonths: null, weekOfMonth: null }, NOW);
    expect(callsOf('johns', 'update')[1][0]).toMatchObject({ every_weeks: 2, every_months: null, week_of_month: null, anchor_month: null });
  });

  it('edits a John in this house only', async () => {
    const id = crypto.randomUUID();
    await saveJohn('h1', RULES, { ...NEW_JOHN, id, name: 'Hob', points: 5 }, NOW);
    expect(callsOf('johns', 'update')[0][0]).toMatchObject({ name: 'Hob', points: 5 });
    expect(callsOf('johns', 'eq')).toEqual([
      ['id', id],
      ['house_id', 'h1'],
    ]);
    expect(callsOf('johns', 'insert')).toEqual([]);
  });

  it("says what's wrong before writing anything", async () => {
    await expect(saveJohn('h1', RULES, { ...NEW_JOHN, name: ' ' }, NOW)).rejects.toThrow('Name the John.');
    await expect(saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Hob', dueTime: '9pm' }, NOW)).rejects.toThrow('Give a time like 21:00.');
    expect(mockCalls).toEqual([]);
  });

  it("says so when RLS let the write reach nothing: it wasn't an admin's", async () => {
    mockAnswers.johns = { data: [], error: null };
    await expect(saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Hob' }, NOW)).rejects.toThrow('Only the house admins can do that.');
  });

  it("passes on the database's refusal in words", async () => {
    mockAnswers.johns = { data: null, error: { code: '42501', message: 'permission denied for table johns' } };
    await expect(saveJohn('h1', RULES, { ...NEW_JOHN, name: 'Hob' }, NOW)).rejects.toThrow("You can’t do that.");
  });
});

describe('archiveJohn', () => {
  it('takes a John off the list, from now', async () => {
    await archiveJohn('h1', 'j1', NOW);
    expect(callsOf('johns', 'update')).toEqual([[{ archived_at: NOW.toISOString() }]]);
    expect(callsOf('johns', 'eq')).toEqual([
      ['id', 'j1'],
      ['house_id', 'h1'],
    ]);
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

  it("writes the rules to the house's own columns", async () => {
    await updateHouse('h1', settings);
    expect(callsOf('houses', 'update')).toEqual([
      [
        {
          name: 'Flat 3',
          timezone: 'Europe/Paris',
          currency: 'EUR',
          week_starts: 7,
          stake_minor: 1500,
          late_forfeit_minor: 50,
          missed_forfeit_minor: 250,
          dispute_hours: 48,
          away_makeup: 50,
        },
      ],
    ]);
    expect(callsOf('houses', 'eq')).toEqual([['id', 'h1']]);
  });

  it('writes how the house shares Johns and its budget when the form has them', async () => {
    await updateHouse('h1', { ...settings, dealMode: 'classic', dealBudget: 2 });
    const [[row]] = callsOf('houses', 'update') as [[Record<string, unknown>]];
    expect(row).toMatchObject({ deal_mode: 'classic', deal_budget: 2 });
  });

  it('writes only how the house shares Johns when Describe your house asks it', async () => {
    await saveDealMode('h1', 'classic');
    expect(callsOf('houses', 'update')).toEqual([[{ deal_mode: 'classic' }]]);
    expect(callsOf('houses', 'eq')).toEqual([['id', 'h1']]);
    mockAnswers.houses = { data: [], error: null };
    await expect(saveDealMode('h1', 'smart')).rejects.toThrow('Only the house admins can do that.');
  });

  it('says what is wrong with the rules first', async () => {
    await expect(updateHouse('h1', { ...settings, name: '' })).rejects.toThrow('Give the house a name.');
    await expect(updateHouse('h1', { ...settings, stakeMinor: -1 })).rejects.toThrow("Amounts can’t be negative.");
    expect(mockCalls).toEqual([]);
  });

  it("names the database's refusal: a zone it doesn't know, or someone who isn't an admin", async () => {
    mockAnswers.houses = { data: null, error: { code: '22023', message: 'unknown_timezone' } };
    await expect(updateHouse('h1', settings)).rejects.toThrow("That time zone isn’t one we recognise.");
    mockAnswers.houses = { data: [], error: null };
    await expect(updateHouse('h1', settings)).rejects.toThrow('Only the house admins can do that.');
  });
});

describe('roles and leaving', () => {
  it('asks set_member_role and remove_member, which decide', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await setRole('h1', 'sam', 'admin');
    await removeMember('h1', 'sam');
    expect(rpc.mock.calls).toEqual([
      ['set_member_role', { p_house: 'h1', p_user: 'sam', p_role: 'admin' }],
      ['remove_member', { p_house: 'h1', p_user: 'sam' }],
    ]);
  });

  it('says why not in words', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'last_admin' } });
    await expect(setRole('h1', 'priya', 'member')).rejects.toThrow('Make someone else an admin first. A house needs at least one.');
    await expect(removeMember('h1', 'priya')).rejects.toThrow('Make someone else an admin first.');
  });
});

describe('groups', () => {
  const ava = crypto.randomUUID();
  const ben = crypto.randomUUID();

  it('makes a group through save_group, which checks they all live here', async () => {
    rpc.mockResolvedValue({ data: 'g1', error: null });
    await saveGroup('h1', { name: ' Upstairs ', members: [ava, ben] });
    expect(rpc).toHaveBeenCalledWith('save_group', { p_house: 'h1', p_group: null, p_name: 'Upstairs', p_members: [ava, ben] });
  });

  it("changes who's in one by its id", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const id = crypto.randomUUID();
    await saveGroup('h1', { id, name: 'Upstairs', members: [ava] });
    expect(rpc).toHaveBeenCalledWith('save_group', { p_house: 'h1', p_group: id, p_name: 'Upstairs', p_members: [ava] });
  });

  it("says what's missing before asking, and the database's refusal after", async () => {
    await expect(saveGroup('h1', { name: 'Upstairs', members: [] })).rejects.toThrow('Pick at least one housemate.');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'group_name_taken' } });
    await expect(saveGroup('h1', { name: 'Upstairs', members: [ava] })).rejects.toThrow("There’s already a group with that name.");
  });

  it('deletes a group through delete_group', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await deleteGroup('g1');
    expect(rpc).toHaveBeenCalledWith('delete_group', { p_group: 'g1' });
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'admins_only' } });
    await expect(deleteGroup('g1')).rejects.toThrow('Only the house admins can do that.');
  });
});

describe('dealThisWeek', () => {
  it('asks the server to deal the house', async () => {
    (apiPost as jest.Mock).mockResolvedValue({ ok: true });
    await dealThisWeek('h1');
    expect(apiPost).toHaveBeenCalledWith('/api/deal', { houseId: 'h1' }, MoveResponse);
  });
});
