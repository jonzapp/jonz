import { ALL_OF_THE_AUDIT, auditCount, auditEntry, auditPage, deleteByEmail, deletionsPage, endNotice, noticesPage } from './owner';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: { auth: {} } }));

const call = callV1 as jest.Mock;
const ROW = {
  id: 7,
  createdAt: '2026-11-01T10:00:00Z',
  actor: 'owner@jonz.app',
  action: 'update',
  targetKind: 'notice',
  targetId: 'n1',
  reason: null,
  before: { linkLabel: 'Old', startsAt: '2026-11-01' },
  after: { linkLabel: 'New', startsAt: '2026-11-01' },
};

beforeEach(() => jest.clearAllMocks());

describe('the audit log', () => {
  it('reads a page on /v1 without saying who "You" is, and keeps the changed fields in their column names', async () => {
    call.mockResolvedValue({ data: [ROW], hasMore: true, startingAfter: 'c-7' });
    const page = await auditPage('c-8', { ...ALL_OF_THE_AUDIT, who: 'you', ownerId: 'u1' });
    expect(call).toHaveBeenCalledWith('owner_audit_page', {
      q: '',
      who: 'you',
      what: 'anything',
      after: null,
      before: null,
      limit: 50,
      startingAfter: 'c-8',
    });
    expect(page).toEqual({
      more: true,
      next: 'c-7',
      entries: [
        {
          id: 7,
          at: '2026-11-01T10:00:00Z',
          actor: 'owner@jonz.app',
          action: 'update',
          targetKind: 'notice',
          targetId: 'n1',
          reason: null,
          before: { link_label: 'Old', starts_at: '2026-11-01' },
          after: { link_label: 'New', starts_at: '2026-11-01' },
        },
      ],
    });
  });

  it('counts and reads one entry, or none', async () => {
    call.mockResolvedValue(3);
    await expect(auditCount()).resolves.toBe(3);
    expect(call).toHaveBeenLastCalledWith('owner_audit_count', { q: '', who: 'anyone', what: 'anything', after: null, before: null });
    call.mockResolvedValue(null);
    await expect(auditEntry(9)).resolves.toBeNull();
    expect(call).toHaveBeenLastCalledWith('owner_audit_entry', { entryId: 9 });
  });
});

describe('notices and deletions', () => {
  it('reads a page of notices from the start', async () => {
    call.mockResolvedValue({ data: [], hasMore: false, startingAfter: null });
    await expect(noticesPage(null, { q: '', kind: null, state: null, after: null, before: null })).resolves.toEqual({
      notices: [],
      more: false,
      next: null,
    });
    expect(call.mock.calls[0][0]).toBe('owner_notices_page');
    expect(call.mock.calls[0][1]).toMatchObject({ limit: 50, startingAfter: undefined });
  });

  it('reads who is waiting to be deleted, as Deletions shows them', async () => {
    call.mockResolvedValue({
      data: [
        { userId: 'u1', name: null, email: 'kit@x.com', houseName: null, requestedAt: '2026-11-01', deletesAt: '2026-12-01', requestedBy: 'owner' },
      ],
      hasMore: false,
      startingAfter: null,
    });
    const page = await deletionsPage(null, { q: '', by: null, goes: null, after: null, before: null });
    expect(page.people).toEqual([
      { userId: 'u1', name: '', email: 'kit@x.com', house: null, requestedAt: '2026-11-01', deleteAfter: '2026-12-01', requestedBy: 'owner' },
    ]);
  });

  it('ends a notice and starts a deletion by email, trimmed, a blank reason left out', async () => {
    call.mockResolvedValue({ copied: true });
    await expect(endNotice('n1')).resolves.toEqual({ copied: true });
    expect(call.mock.calls.map(([n]) => n)).toEqual(['end_notice', 'write_notice_copy']);
    expect(call).toHaveBeenCalledWith('end_notice', { noticeId: 'n1' });
    call.mockResolvedValue(null);
    await deleteByEmail(' kit@x.com ', '  ');
    expect(call).toHaveBeenLastCalledWith('owner_request_deletion', { email: 'kit@x.com', reason: undefined });
  });
});
