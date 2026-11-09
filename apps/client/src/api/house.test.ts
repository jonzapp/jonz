import { ApiRequestError } from './base';
import { catchUp, createHouse, getMyHouse, houseByCode, joinHouse } from './house';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const call = callV1 as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getMyHouse', () => {
  it('reads your house on /v1', async () => {
    call.mockResolvedValue({ houseId: 'h1', name: 'Flat 3', kind: 'housemates' });
    await expect(getMyHouse('u1')).resolves.toEqual({ id: 'h1', name: 'Flat 3', kind: 'housemates' });
    expect(call).toHaveBeenCalledWith('my_house', {});
  });

  it('is null in no house, and fails when it cannot read', async () => {
    call.mockResolvedValueOnce(null);
    await expect(getMyHouse('u1')).resolves.toBeNull();
    call.mockRejectedValueOnce(new Error('offline'));
    await expect(getMyHouse('u1')).rejects.toThrow('offline');
  });
});

describe('houseByCode', () => {
  it('tidies the code before asking', async () => {
    call.mockResolvedValue([
      { id: 'h1', name: 'Flat 3', members: 3, kind: 'housemates', currency: 'GBP', stakeMinor: 2000, lateForfeitMinor: 100, missedForfeitMinor: 300 },
    ]);
    await expect(houseByCode('ab3d-ef7h')).resolves.toEqual({
      id: 'h1',
      name: 'Flat 3',
      members: 3,
      kind: 'housemates',
      currency: 'GBP',
      stakeMinor: 2000,
      lateMinor: 100,
      missedMinor: 300,
    });
    expect(call).toHaveBeenCalledWith('house_by_code', { code: 'AB3DEF7H' });
  });

  it("is null for a code that matches nothing, and doesn't ask about one that can't be a code", async () => {
    call.mockResolvedValue([]);
    await expect(houseByCode('AB3DEF7H')).resolves.toBeNull();
    call.mockClear();
    await expect(houseByCode('nope')).resolves.toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
});

describe('joinHouse', () => {
  it('joins with the tidied code', async () => {
    call.mockResolvedValue('h1');
    await expect(joinHouse('ab3def7h')).resolves.toBe('h1');
    expect(call).toHaveBeenCalledWith('join_house', { code: 'AB3DEF7H' });
  });

  it('passes on the refusal, and never asks with a code that can’t be one', async () => {
    call.mockRejectedValue(new ApiRequestError('You’re already in a house. Leave it first to join another.', 409));
    await expect(joinHouse('AB3DEF7H')).rejects.toThrow('You’re already in a house. Leave it first to join another.');
    call.mockClear();
    await expect(joinHouse('bad')).rejects.toThrow('That invite doesn’t open a house. Ask a housemate for theirs, or start your own.');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('createHouse', () => {
  const house = { name: ' Flat 3 ', timezone: 'Europe/London', currency: 'GBP', weekStarts: 1 } as const;

  it('sets up the house with the tidied name', async () => {
    call.mockResolvedValue('h1');
    await expect(createHouse(house)).resolves.toBe('h1');
    expect(call).toHaveBeenCalledWith('create_house', { name: 'Flat 3', timezone: 'Europe/London', currency: 'GBP', weekStarts: 1, kind: 'housemates' });
  });

  it('sets up a family when asked', async () => {
    call.mockResolvedValue('h1');
    await createHouse({ ...house, kind: 'family' });
    expect(call).toHaveBeenCalledWith('create_house', expect.objectContaining({ kind: 'family' }));
  });

  it('asks for a name before asking', async () => {
    await expect(createHouse({ ...house, name: ' ' })).rejects.toThrow('Give the house a name.');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('catchUp', () => {
  it('asks /v1 to catch the house up, and says whether it did', async () => {
    call.mockResolvedValue({ ticked: true });
    await expect(catchUp('h1')).resolves.toBe(true);
    expect(call).toHaveBeenCalledWith('catch_up', { houseId: 'h1' });
  });
});
