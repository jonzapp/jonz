import { inboxCount, inboxFilter, inboxPage, myReport, openReport, sameAsFind, sendReport, setSameAs, setSupportDraft, supportDraft } from './reports';
import { supabase } from './supabase';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));
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
  jest.mocked(callV1).mockResolvedValue({ ok: true, id: 'r9' });
});

it('uploads screenshots to the sender’s own folder, then sends the report on /v1', async () => {
  const id = await sendReport({ kind: 'problem', words: '  Bins vanished  ', details: { pages: 'Today' }, shots: ['file:///a.jpg'] });
  expect(id).toBe('r9');
  const path = 'ava/0b6c8f3e-2f1d-4d33-9a51-6c1b1e0f5a77.jpg';
  expect(upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), { contentType: 'image/jpeg' });
  expect(callV1).toHaveBeenCalledWith('send_report', { kind: 'problem', words: 'Bins vanished', details: { pages: 'Today' }, shots: [path] });
});

it('refuses a screenshot over the bucket’s 5 MB before uploading it', async () => {
  global.fetch = jest.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024) }) as unknown as typeof fetch;
  await expect(sendReport({ kind: 'problem', words: 'x', details: null, shots: ['file:///big.jpg'] })).rejects.toThrow(/too big/);
  expect(upload).not.toHaveBeenCalled();
  expect(callV1).not.toHaveBeenCalled();
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
  const report = { id: 'r1', userId: 'ava', kind: 'problem', state: 'replied', words: 'Bins vanished', details: { pages: 'Today' }, shots: ['ava/s.jpg'], createdAt: '2026-10-31T20:00:00Z', source: 'app', subject: null };
  const messages = [{ fromOwner: true, authorName: 'Glyn', body: 'Fixed.', createdAt: '2026-10-31T21:00:00Z' }];
  jest.mocked(callV1).mockResolvedValue({ report, messages });
  const mine = await myReport('r1');
  expect(callV1).toHaveBeenCalledWith('my_report', { reportId: 'r1' });
  expect(mine?.messages).toEqual([
    { from: 'them', name: null, at: report.createdAt, text: 'Bins vanished', shots: ['https://storage.test/ava/s.jpg?token=t'] },
    { from: 'jonz', name: 'Glyn', at: messages[0].createdAt, text: 'Fixed.' },
  ]);
  expect(mine?.details).toEqual({ pages: 'Today', app: undefined, house: undefined, error: undefined });
  jest.mocked(callV1).mockResolvedValue(null);
  await expect(myReport('r2')).resolves.toBeNull();
});

it('opens one for the owner with who sent it and from where', async () => {
  jest.mocked(callV1).mockResolvedValue({
    id: 'r1', userId: 'ava', name: 'Ava Brown', email: 'ava@example.com', houseId: 'h1', houseName: 'The Annexe', role: 'member', kind: 'idea', state: 'open',
    words: 'Dark mode', details: null, shots: [], createdAt: '2026-10-31T20:00:00Z', updatedAt: '2026-10-31T20:00:00Z', source: 'app', subject: null,
    sameAs: { id: 'r0', words: 'Night theme', state: 'open', name: 'Ben' }, also: [], messages: [],
  });
  const report = await openReport('r1');
  expect(callV1).toHaveBeenCalledWith('owner_open_report', { reportId: 'r1' });
  expect(report).toMatchObject({ name: 'Ava Brown', email: 'ava@example.com', house: 'The Annexe', kind: 'idea', state: 'open', details: null });
  expect(report.sameAs).toEqual({ id: 'r0', name: 'Ben', words: 'Night theme', state: 'open' });
  expect(report.messages).toEqual([{ from: 'them', name: 'Ava Brown', at: '2026-10-31T20:00:00Z', text: 'Dark mode' }]);
});

it('reads a page of the Inbox, where it came from as `from`, and passes on where the next starts', async () => {
  const filter = { q: '', state: 'waiting' as const, source: 'email' as const, kind: null, after: null, before: null };
  jest.mocked(callV1).mockResolvedValue({
    data: [
      { id: 'r1', userId: null, name: 'Sam', email: 's@x.com', houseName: null, kind: 'question', state: 'new', words: 'Hi', createdAt: '2026-10-31T20:00:00Z', lastActivityAt: '2026-10-31T20:00:00Z', source: 'email', subject: 'Stake', sameAsReportId: 'r0', also: 0 },
    ],
    hasMore: true,
    startingAfter: 'c-1',
  });
  const page = await inboxPage('c-0', filter);
  expect(callV1).toHaveBeenCalledWith('owner_reports_page', { q: '', state: 'waiting', from: 'email', kind: null, after: null, before: null, limit: 50, startingAfter: 'c-0' });
  expect(page).toMatchObject({ more: true, next: 'c-1', items: [{ id: 'r1', source: 'email', subject: 'Stake', folded: true, sentAt: '2026-10-31T20:00:00Z' }] });
  jest.mocked(callV1).mockResolvedValue(4);
  await expect(inboxCount(filter)).resolves.toBe(4);
  expect(callV1).toHaveBeenLastCalledWith('owner_reports_count', { q: '', state: 'waiting', from: 'email', kind: null, after: null, before: null });
});

it('folds, finds and drafts on /v1', async () => {
  jest.mocked(callV1).mockResolvedValue(null);
  await setSameAs('r1', null);
  expect(callV1).toHaveBeenLastCalledWith('owner_same_as', { reportId: 'r1', mainId: null });
  await setSupportDraft('d1', 'used');
  expect(callV1).toHaveBeenLastCalledWith('owner_set_support_draft', { draftId: 'd1', state: 'used' });
  jest.mocked(callV1).mockResolvedValue([{ id: 'r2', name: null, words: 'Bins', state: 'fixed', createdAt: '2026-10-31T20:00:00Z' }]);
  await expect(sameAsFind('r1', 'bin')).resolves.toEqual([{ id: 'r2', name: null, words: 'Bins', state: 'fixed' }]);
  jest.mocked(callV1).mockResolvedValue({ draft: null });
  await expect(supportDraft('r1')).resolves.toBeNull();
  expect(callV1).toHaveBeenLastCalledWith('claim_support_draft', { reportId: 'r1' });
});
