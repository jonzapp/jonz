import { Platform } from 'react-native';

import { getAccessToken } from './auth';
import { ApiRequestError } from './http';
import { callV1, problemSentence, v1Request } from './v1';

jest.mock('./auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'idem-1' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.4.2', ios: { buildNumber: '57' }, android: { versionCode: 57 } } } }));

const token = getAccessToken as jest.Mock;
const fetchMock = jest.fn();
const HOUSE = '8f14e45f-ceea-467f-a8f5-2fbf7c2d9b1a';
const DISPUTE = 'c4ca4238-a0b9-4382-8dcc-509a6f75849b';

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

beforeAll(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  token.mockResolvedValue('access-token');
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
});

describe('v1Request', () => {
  it('puts path keys in the path and the rest in a JSON body', () => {
    expect(v1Request('cast_vote', { disputeId: DISPUTE, uphold: true })).toEqual({
      method: 'POST',
      url: `https://api.example.test/v1/disputes/${DISPUTE}/votes`,
      body: JSON.stringify({ uphold: true }),
    });
  });

  it("puts a GET's other inputs in the query, leaving out what isn't set", () => {
    const { method, url, body } = v1Request('house_history', { houseId: HOUSE, limit: 20, startingAfter: undefined });
    expect(method).toBe('GET');
    expect(url).toMatch(new RegExp(`/v1/houses/${HOUSE}/[a-z-/]+\\?limit=20$`));
    expect(body).toBeUndefined();
  });
});

describe('callV1', () => {
  it('writes as the signed-in person, once, and checks the answer', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }));
    await expect(callV1('cast_vote', { disputeId: DISPUTE, uphold: false })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(`https://api.example.test/v1/disputes/${DISPUTE}/votes`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Jonz-Client': `${Platform.OS === 'android' ? 'android' : 'ios'}/1.4.2 (57)`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-1',
      },
      body: JSON.stringify({ uphold: false }),
    });
  });

  it('turns a problem into a sentence, keeping the status', async () => {
    fetchMock.mockResolvedValue(reply(400, { title: 'rejected', status: 400, detail: 'vote_closed' }));
    const refusal = await callV1('cast_vote', { disputeId: DISPUTE, uphold: true }).catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(ApiRequestError);
    expect(refusal).toMatchObject({ message: 'Voting on that has closed.', status: 400 });
  });

  it("refuses an answer that isn't the contract's", async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: 'yes' }));
    await expect(callV1('cast_vote', { disputeId: DISPUTE, uphold: true })).rejects.toThrow();
  });

  it("checks the input, and doesn't call signed out", async () => {
    await expect(callV1('cast_vote', { disputeId: 'd1', uphold: true })).rejects.toThrow();
    token.mockResolvedValue(null);
    await expect(callV1('cast_vote', { disputeId: DISPUTE, uphold: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('problemSentence', () => {
  it("says the app's sentence for a refusal word, the API's own words otherwise", () => {
    expect(problemSentence({ title: 'rejected', detail: 'vote_closed' })).toBe('Voting on that has closed.');
    expect(problemSentence({ title: 'pass_required', detail: 'This needs the House Pass.' })).toBe('This needs the House Pass.');
    expect(problemSentence({ title: 'forbidden', detail: 'not_allowed_here' })).toBe('You can’t do that.');
  });

  it('never shows an unknown word or our side of a failure', () => {
    expect(problemSentence({ title: 'rejected', detail: 'some_new_word' })).toBe('Something went wrong. Try again.');
    expect(problemSentence({ title: 'internal', detail: 'Something went wrong on our side.' })).toBe('Something went wrong. Try again.');
    expect(problemSentence(null)).toBe('Something went wrong. Try again.');
  });
});
