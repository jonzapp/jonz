import { ReportResponse } from '@app/core';

import { apiPost } from './http';
import { inboxFilter, myReport, openReport, sendReport } from './reports';
import { supabase } from './supabase';

jest.mock('./http', () => ({ apiPost: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '0b6c8f3e-2f1d-4d33-9a51-6c1b1e0f5a77' }));

const upload = jest.fn().mockResolvedValue({ error: null });
const createSignedUrls = jest.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ signedUrl: `https://storage.test/${p}?token=t` })), error: null }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(supabase, {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'ava' } } } }) },
    storage: { from: jest.fn(() => ({ upload, createSignedUrls })) },
  });
  global.fetch = jest.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(1024) }) as unknown as typeof fetch;
  jest.mocked(apiPost).mockResolvedValue({ ok: true, id: 'r9' });
});

it('uploads screenshots to the sender’s own folder, then sends the report through the API', async () => {
  const id = await sendReport({ kind: 'problem', words: '  Bins vanished  ', details: { pages: 'Today' }, shots: ['file:///a.jpg'] });
  expect(id).toBe('r9');
  const path = 'ava/0b6c8f3e-2f1d-4d33-9a51-6c1b1e0f5a77.jpg';
  expect(upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), { contentType: 'image/jpeg' });
  expect(apiPost).toHaveBeenCalledWith('/api/reports', { kind: 'problem', words: 'Bins vanished', details: { pages: 'Today' }, shots: [path] }, ReportResponse);
});

it('refuses a screenshot over the bucket’s 5 MB before uploading it', async () => {
  global.fetch = jest.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024) }) as unknown as typeof fetch;
  await expect(sendReport({ kind: 'problem', words: 'x', details: null, shots: ['file:///big.jpg'] })).rejects.toThrow(/too big/);
  expect(upload).not.toHaveBeenCalled();
  expect(apiPost).not.toHaveBeenCalled();
});

it('opens on what is waiting, and reads the search box’s picks', () => {
  const ask = { q: 'bins', picks: {}, after: null, before: null };
  expect(inboxFilter(ask)).toEqual({ q: 'bins', state: 'waiting', source: null, kind: null, after: null, before: null });
  expect(inboxFilter({ ...ask, picks: { source: 'email' } })).toMatchObject({ source: 'email' });
  expect(inboxFilter({ ...ask, picks: { source: 'any' } })).toMatchObject({ source: null });
  expect(inboxFilter({ ...ask, picks: { state: 'any', kind: 'idea' } })).toMatchObject({ state: null, kind: 'idea' });
  expect(inboxFilter({ ...ask, picks: { state: 'fixed', kind: 'nonsense' } })).toMatchObject({ state: 'fixed', kind: null });
});

it('reads one of yours as a conversation: the first words with their screenshots, then the replies', async () => {
  const row = { id: 'r1', user_id: 'ava', kind: 'problem', state: 'replied', words: 'Bins vanished', details: { pages: 'Today' }, shots: ['ava/s.jpg'], created_at: '2026-10-31T20:00:00Z' };
  const messages = [{ from_owner: true, author_name: 'Glyn', body: 'Fixed.', at: '2026-10-31T21:00:00Z' }];
  const chain = (data: unknown) => {
    const q = { select: () => q, eq: () => q, order: () => q, maybeSingle: async () => ({ data, error: null }) };
    return q;
  };
  Object.assign(supabase, {
    from: jest.fn((table: string) => {
      if (table === 'reports') return chain(row);
      const q = { select: () => q, eq: () => q, order: () => q, then: (ok: (v: unknown) => void) => ok({ data: messages, error: null }) };
      return q;
    }),
  });
  const report = await myReport('r1');
  expect(report?.messages).toEqual([
    { from: 'them', name: null, at: row.created_at, text: 'Bins vanished', shots: ['https://storage.test/ava/s.jpg?token=t'] },
    { from: 'jonz', name: 'Glyn', at: messages[0].at, text: 'Fixed.' },
  ]);
  expect(report?.details).toEqual({ pages: 'Today', app: undefined, house: undefined, error: undefined });
});

it('opens one for the owner with who sent it and from where', async () => {
  Object.assign(supabase, {
    rpc: jest.fn().mockResolvedValue({
      data: {
        id: 'r1', user_id: 'ava', name: 'Ava Brown', email: 'ava@example.com', house_name: 'The Annexe', role: 'member', kind: 'idea', state: 'open',
        words: 'Dark mode', details: null, shots: [], created_at: '2026-10-31T20:00:00Z', messages: [],
      },
      error: null,
    }),
  });
  const report = await openReport('r1');
  expect(supabase.rpc).toHaveBeenCalledWith('owner_open_report', { p_report: 'r1' });
  expect(report).toMatchObject({ name: 'Ava Brown', email: 'ava@example.com', house: 'The Annexe', kind: 'idea', state: 'open', details: null });
  expect(report.messages).toEqual([{ from: 'them', name: 'Ava Brown', at: '2026-10-31T20:00:00Z', text: 'Dark mode' }]);
});
