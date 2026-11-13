import { listAsDraft, NEW_JOHN, starterDraft, tidyDraft, type HouseRules, type JohnDef } from '@app/core';

import { applyDraft, keepDraft, sendChat } from './draft';
import { ApiRequestError } from './base';
import { addJohns, archiveJohn, loadJohnList, saveGroup, saveJohn } from './settings';
import { callV1 } from './v1';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('./v1', () => ({ callV1: jest.fn() }));
jest.mock('./settings', () => ({ addJohns: jest.fn(), archiveJohn: jest.fn(), loadJohnList: jest.fn(), saveGroup: jest.fn(), saveJohn: jest.fn() }));

const post = callV1 as jest.Mock;
const from = loadJohnList as jest.Mock;
const HOUSE = 'c4ca4238-a0b9-4382-8dcc-509a6f75849b';
const ME = '00000000-0000-4000-8000-000000000001';
const RULES: HouseRules = {
  timezone: 'Europe/London',
  currency: 'GBP',
  weekStarts: 1,
  stakeMinor: 0,
  lateForfeitMinor: 0,
  missedForfeitMinor: 0,
  disputeHours: 24,
  coverGraceHours: 3,
  lateHours: 24,
  dealMode: 'smart',
  dealBudget: 4,
};
const NOW = new Date('2026-10-28T12:00:00Z');

beforeEach(() => jest.clearAllMocks());

describe('sendChat', () => {
  const said = (text: string) => [{ role: 'user' as const, text }];

  it('sends the chat and the draft as it stands', async () => {
    const answer = { reply: 'Here you go.', ask: null, draft: starterDraft('couple'), source: 'ai' };
    post.mockResolvedValue(answer);
    await expect(sendChat(HOUSE, said('Me and my partner in a flat'), null, words)).resolves.toBe(answer);
    expect(post).toHaveBeenCalledWith('ask_house', { houseId: HOUSE, messages: said('Me and my partner in a flat'), draft: null });
  });

  it("passes on the API's refusal", async () => {
    post.mockRejectedValue(new ApiRequestError('That’s enough for one day.', 409));
    await expect(sendChat(HOUSE, said('Five of us'), null, words)).rejects.toThrow('That’s enough for one day.');
  });

  it('answers as the API would when it can’t be reached', async () => {
    post.mockRejectedValue(new TypeError('Network request failed'));
    await expect(sendChat(HOUSE, said('Me, my wife and the kids'), null, words)).resolves.toMatchObject({ draft: starterDraft('family'), source: 'starter' });
    post.mockRejectedValue(new ApiRequestError('Something went wrong. Try again.', 500));
    await expect(sendChat(HOUSE, said('Oven every month'), starterDraft('couple'), words)).resolves.toEqual({
      reply: words('ask.draft.offlineChange'),
      ask: null,
      draft: null,
      source: 'starter',
    });
  });
});

describe('keepDraft', () => {
  const draft = tidyDraft(
    {
      groups: [{ name: 'Upstairs', members: ['me'] }],
      johns: [
        { name: 'Upstairs bathroom', category: 'bathroom', points: 4, group: 'Upstairs' },
        { name: 'Bins', category: 'bins', points: 1 },
        { name: 'Oven', category: 'kitchen', points: 5 },
      ],
    },
    [{ userId: ME, name: 'Glyn' }],
    ME,
  );

  it('makes the groups the kept Johns need, then adds them with their group', async () => {
    from.mockResolvedValue({ johns: [], groups: [{ id: 'g1', name: 'Upstairs', memberIds: [ME] }] });
    await expect(keepDraft({ houseId: HOUSE, rules: RULES, groups: [], now: NOW }, draft, [0, 1])).resolves.toBe(2);
    expect(saveGroup).toHaveBeenCalledWith(HOUSE, { name: 'Upstairs', members: [ME] });
    const [, , johns] = (addJohns as jest.Mock).mock.calls[0];
    expect(johns.map((j: { name: string; groupId: string | null }) => [j.name, j.groupId])).toEqual([
      ['Upstairs bathroom', 'g1'],
      ['Bins', null],
    ]);
  });

  it("uses the house's own group of that name, and makes none", async () => {
    await keepDraft({ houseId: HOUSE, rules: RULES, groups: [{ id: 'g9', name: 'upstairs', memberIds: [ME] }], now: NOW }, draft, [0]);
    expect(saveGroup).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect((addJohns as jest.Mock).mock.calls[0][2][0].groupId).toBe('g9');
  });
});

describe('applyDraft', () => {
  const BATH = '11111111-1111-4111-8111-111111111111';
  const BINS = '22222222-2222-4222-8222-222222222222';
  const johns: JohnDef[] = [
    { ...NEW_JOHN, id: BATH, name: 'Bathroom', category: 'bathroom', points: 3, needsPhoto: true },
    { ...NEW_JOHN, id: BINS, name: 'Bins out', category: 'bins', points: 1 },
  ];
  const base = listAsDraft(johns, []);
  const next = {
    ...base,
    johns: [{ ...base.johns[0], points: 4 }, { ...starterDraft('couple').johns[0] }],
  };

  it('adds, changes and takes off only the ticked changes, keeping what the draft doesn’t say', async () => {
    const keys = [`change:${BATH}`, 'add:1', `remove:${BINS}`];
    await expect(applyDraft({ houseId: HOUSE, rules: RULES, list: { johns, groups: [] }, now: NOW }, { base, draft: next, keys })).resolves.toBe(3);
    expect((addJohns as jest.Mock).mock.calls[0][2].map((j: { name: string }) => j.name)).toEqual([next.johns[1].name]);
    expect(saveJohn).toHaveBeenCalledWith(HOUSE, RULES, expect.objectContaining({ id: BATH, points: 4, needsPhoto: true, groupId: null }), NOW);
    expect(archiveJohn).toHaveBeenCalledWith(HOUSE, BINS, NOW);
  });

  it('leaves an unticked change alone', async () => {
    await applyDraft({ houseId: HOUSE, rules: RULES, list: { johns, groups: [] }, now: NOW }, { base, draft: next, keys: ['add:1'] });
    expect(saveJohn).not.toHaveBeenCalled();
    expect(archiveJohn).not.toHaveBeenCalled();
  });

  it('changes who’s in a group the house has, by its id, only when ticked', async () => {
    const IVY = '00000000-0000-4000-8000-000000000009';
    const floor = { id: 'g1', name: 'Main floor', memberIds: [ME] };
    const was = listAsDraft(johns, [floor]);
    const ivyIn = { ...was, groups: [{ name: 'Main floor', memberIds: [ME, IVY], waitingFor: [] }] };
    await expect(applyDraft({ houseId: HOUSE, rules: RULES, list: { johns, groups: [floor] }, now: NOW }, { base: was, draft: ivyIn, keys: [] })).resolves.toBe(0);
    expect(saveGroup).not.toHaveBeenCalled();
    await expect(applyDraft({ houseId: HOUSE, rules: RULES, list: { johns, groups: [floor] }, now: NOW }, { base: was, draft: ivyIn, keys: ['group:Main floor'] })).resolves.toBe(1);
    expect(saveGroup).toHaveBeenCalledWith(HOUSE, { id: 'g1', name: 'Main floor', members: [ME, IVY] });
  });
});
