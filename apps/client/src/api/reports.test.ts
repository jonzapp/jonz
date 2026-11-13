import { inboxCount, inboxFilter, inboxPage, inboxRows, myReport, openReport, sameAsFind, sendReport, setSameAs, setSupportDraft, supportDraft } from './reports';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: {} }));

const PATH = 'ava/0b6c.jpg';
const UPLOAD = `https://jonz.app/files/up/report-shots/${PATH}?token=t`;
const linkFor = (p: string) => `https://jonz.app/files/see/report-shots/${p}?token=t`;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async (url: string) => (url === UPLOAD ? { ok: true, status: 204 } : { arrayBuffer: async () => new ArrayBuffer(1024) })) as unknown as typeof fetch;
  jest.mocked(callV1).mockImplementation((async (name: string, input: { paths?: string[] }) => {
    if (name === 'file_upload') return { path: PATH, upload: UPLOAD, link: null };
    if (name === 'file_links') return { links: Object.fromEntries((input.paths ?? []).map((p) => [p, linkFor(p)])) };
    return { ok: true, id: 'r9' };
  }) as never);
});

it('uploads screenshots where /v1 says, then sends the report on /v1', async () => {
  const id = await sendReport({ kind: 'problem', words: '  Bins vanished  ', details: { pages: 'Today' }, shots: ['file:///a.jpg'] });
  expect(id).toBe('r9');
  expect(callV1).toHaveBeenCalledWith('file_upload', { kind: 'shot', type: 'image/jpeg' });
  expect(global.fetch).toHaveBeenCalledWith(UPLOAD, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: expect.any(ArrayBuffer) });
  expect(callV1).toHaveBeenCalledWith('send_report', { kind: 'problem', words: 'Bins vanished', details: { pages: 'Today' }, shots: [PATH] });
});

it('refuses a screenshot over the limit before uploading it', async () => {
  global.fetch = jest.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(6 * 1024 * 1024) }) as unknown as typeof fetch;
  await expect(sendReport({ kind: 'problem', words: 'x', details: null, shots: ['file:///big.jpg'] })).rejects.toThrow(/too big/);
  expect(callV1).not.toHaveBeenCalled();
});

it('opens on every report, and reads the search box’s picks', () => {
  const ask = { q: 'bins', picks: {}, after: null, before: null };
  expect(inboxFilter(ask)).toEqual({ q: 'bins', state: null, source: null, kind: null, after: null, before: null });
  expect(inboxFilter({ ...ask, picks: { state: 'waiting' } })).toMatchObject({ state: 'waiting' });
  expect(inboxFilter({ ...ask, picks: { source: 'email' } })).toMatchObject({ source: 'email' });
  expect(inboxFilter({ ...ask, picks: { source: 'any' } })).toMatchObject({ source: null });
  expect(inboxFilter({ ...ask, picks: { state: 'any', kind: 'idea' } })).toMatchObject({ state: null, kind: 'idea' });
  expect(inboxFilter({ ...ask, picks: { state: 'fixed', kind: 'nonsense' } })).toMatchObject({ state: 'fixed', kind: null });
});

it('reads one of yours as a conversation: the first words with their screenshots, then the replies', async () => {
  const report = { id: 'r1', userId: 'ava', kind: 'problem', state: 'replied', words: 'Bins vanished', details: { pages: 'Today' }, shots: ['ava/s.jpg'], createdAt: '2026-10-31T20:00:00Z', source: 'app', subject: null };
  const messages = [{ fromOwner: true, authorName: 'Glyn', body: 'Fixed.', createdAt: '2026-10-31T21:00:00Z' }];
  jest.mocked(callV1).mockImplementation((async (name: string, input: { paths?: string[] }) =>
    name === 'file_links' ? { links: Object.fromEntries((input.paths ?? []).map((p) => [p, linkFor(p)])) } : { report, messages }) as never);
  const mine = await myReport('r1');
  expect(callV1).toHaveBeenCalledWith('file_links', { kind: 'shot', paths: ['ava/s.jpg'] });
  expect(callV1).toHaveBeenCalledWith('my_report', { reportId: 'r1' });
  expect(mine?.messages).toEqual([
    { from: 'them', name: null, at: report.createdAt, text: 'Bins vanished', shots: [linkFor('ava/s.jpg')] },
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
  expect(page).toMatchObject({ more: true, next: 'c-1', items: [{ id: 'r1', source: 'email', subject: 'Stake', folded: true, sentAt: '2026-10-31T20:00:00Z', waiting: true }] });
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

describe('the Inbox in two groups', () => {
  const row = (id: string, state: string, sameAsReportId: string | null = null) => ({
    id, userId: null, name: 'Sam', email: null, houseName: null, kind: 'problem', state, words: 'Hi', createdAt: '2026-10-31T20:00:00Z', lastActivityAt: '2026-10-31T20:00:00Z', source: 'app', subject: null, sameAsReportId, also: 0,
  });
  const all = { q: 'bins', state: null, source: null, kind: null, after: null, before: null };
  const pages = (byState: Record<string, { data: unknown[]; hasMore: boolean; startingAfter: string | null }>) =>
    jest.mocked(callV1).mockImplementation((async (_: string, input: { state: string }) => byState[input.state]) as never);

  it('reads what waits for a reply first, then the rest once that runs out', async () => {
    pages({
      waiting: { data: [row('w1', 'new'), row('w2', 'open')], hasMore: false, startingAfter: null },
      answered: { data: [row('a1', 'replied'), row('a2', 'open', 'w2')], hasMore: true, startingAfter: 'c-a' },
    });
    const first = await inboxRows(null, all);
    expect(jest.mocked(callV1).mock.calls.map(([, input]) => (input as { state: string }).state)).toEqual(['waiting', 'answered']);
    expect(first.items.map((r) => [r.id, r.waiting])).toEqual([['w1', true], ['w2', true], ['a1', false], ['a2', false]]);
    expect(first).toMatchObject({ more: true, next: { group: 'answered', after: 'c-a' } });

    jest.mocked(callV1).mockClear();
    await inboxRows({ group: 'answered', after: 'c-a' }, all);
    expect(callV1).toHaveBeenCalledTimes(1);
    expect(callV1).toHaveBeenCalledWith('owner_reports_page', expect.objectContaining({ q: 'bins', state: 'answered', startingAfter: 'c-a' }));
  });

  it('keeps reading the waiting ones while there are more', async () => {
    pages({ waiting: { data: [row('w1', 'new')], hasMore: true, startingAfter: 'c-w' }, answered: { data: [], hasMore: false, startingAfter: null } });
    const first = await inboxRows(null, all);
    expect(callV1).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ more: true, next: { group: 'waiting', after: 'c-w' } });
  });

  it('is one plain list when a state is picked', async () => {
    pages({ replied: { data: [row('a1', 'replied')], hasMore: true, startingAfter: 'c-r' } });
    const page = await inboxRows(null, { ...all, state: 'replied' });
    expect(callV1).toHaveBeenCalledTimes(1);
    expect(page).toMatchObject({ more: true, next: { group: null, after: 'c-r' } });
  });
});
