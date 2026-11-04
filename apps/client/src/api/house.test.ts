import { catchUp, createHouse, getMyHouse, houseByCode, joinHouse } from './house';
import { apiPost } from './http';
import { supabase } from './supabase';

jest.mock('./http', () => ({ apiPost: jest.fn() }));
jest.mock('./supabase', () => {
  const query = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return { supabase: { from: jest.fn(() => query), rpc: jest.fn(), __query: query } };
});

const rpc = supabase.rpc as unknown as jest.Mock;
const query = (supabase as unknown as { __query: { maybeSingle: jest.Mock; eq: jest.Mock } }).__query;
const post = apiPost as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getMyHouse', () => {
  it('reads your house through your own session', async () => {
    query.maybeSingle.mockResolvedValue({ data: { house_id: 'h1', houses: { name: 'Flat 3', kind: 'housemates' } }, error: null });
    await expect(getMyHouse('u1')).resolves.toEqual({ id: 'h1', name: 'Flat 3', kind: 'housemates' });
    expect(supabase.from).toHaveBeenCalledWith('members');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('says when your house is a family', async () => {
    query.maybeSingle.mockResolvedValue({ data: { house_id: 'h1', houses: { name: 'The Parks', kind: 'family' } }, error: null });
    await expect(getMyHouse('u1')).resolves.toMatchObject({ kind: 'family' });
  });

  it('is null in no house, and fails when it cannot read', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getMyHouse('u1')).resolves.toBeNull();
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(getMyHouse('u1')).rejects.toThrow('offline');
  });
});

describe('houseByCode', () => {
  it('tidies the code before asking', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'h1', name: 'Flat 3', members: 3, kind: 'housemates' }], error: null });
    await expect(houseByCode('ab3d-ef7h')).resolves.toEqual({ id: 'h1', name: 'Flat 3', members: 3, kind: 'housemates' });
    expect(rpc).toHaveBeenCalledWith('house_by_code', { p_code: 'AB3DEF7H' });
  });

  it("is null for a code that matches nothing, and doesn't ask about one that can't be a code", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(houseByCode('AB3DEF7H')).resolves.toBeNull();
    rpc.mockClear();
    await expect(houseByCode('nope')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('joinHouse', () => {
  it('joins with the tidied code', async () => {
    rpc.mockResolvedValue({ data: 'h1', error: null });
    await expect(joinHouse('ab3def7h')).resolves.toBe('h1');
    expect(rpc).toHaveBeenCalledWith('join_house', { p_code: 'AB3DEF7H' });
  });

  it("says the database's refusal in words", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'already_in_house', code: 'P0001' } });
    await expect(joinHouse('AB3DEF7H')).rejects.toThrow("You’re already in a house. Leave it first to join another.");
    await expect(joinHouse('bad')).rejects.toThrow("That join link doesn’t open a house. Ask a housemate for theirs, or start your own.");
  });
});

describe('createHouse', () => {
  const house = { name: ' Flat 3 ', timezone: 'Europe/London', currency: 'GBP', weekStarts: 1 } as const;

  it('sets up the house with the tidied name', async () => {
    rpc.mockResolvedValue({ data: 'h1', error: null });
    await expect(createHouse(house)).resolves.toBe('h1');
    expect(rpc).toHaveBeenCalledWith('create_house', {
      p_name: 'Flat 3',
      p_timezone: 'Europe/London',
      p_currency: 'GBP',
      p_week_starts: 1,
      p_kind: 'housemates',
    });
  });

  it('sets up a family when asked', async () => {
    rpc.mockResolvedValue({ data: 'h1', error: null });
    await createHouse({ ...house, kind: 'family' });
    expect(rpc).toHaveBeenCalledWith('create_house', expect.objectContaining({ p_kind: 'family' }));
  });

  it("asks for a name before asking the database, and says the database's refusal in words", async () => {
    await expect(createHouse({ ...house, name: ' ' })).rejects.toThrow('Give the house a name.');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: 'unknown_timezone', code: 'P0001' } });
    await expect(createHouse(house)).rejects.toThrow("That time zone isn’t one we recognise.");
  });
});

describe('catchUp', () => {
  it("asks the API to catch the house up, and says whether it did", async () => {
    post.mockResolvedValue({ ticked: true });
    await expect(catchUp('h1')).resolves.toBe(true);
    expect(post).toHaveBeenCalledWith('/api/fresh', { houseId: 'h1' }, expect.anything());
  });
});
