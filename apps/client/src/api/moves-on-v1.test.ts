import { deletionStatus, requestDeletion } from './account';
import { readApproval } from './approvals';
import { loadHistory, undoLatest } from './history';
import { movingOn, startHouseFrom } from './moving';
import { loadPrefs, savePrefs } from './notification-prefs';
import { supabase } from './supabase';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

const call = callV1 as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
});

it('reads History with each move’s details in their own names', async () => {
  call.mockResolvedValue([
    {
      id: 'a1',
      kind: 'away',
      doneBy: 'ava',
      subjectUserId: null,
      assignmentId: null,
      ref: null,
      data: { startsOn: '2026-11-01', endsOn: '2026-11-03' },
      createdAt: '2026-10-30T10:00:00Z',
      undoneAt: null,
      undoneBy: null,
      reach: 'own',
    },
  ]);
  const [item] = await loadHistory('h1', new Date('2026-11-05T00:00:00Z'));
  expect(call).toHaveBeenCalledWith('house_history', { houseId: 'h1', before: '2026-11-05T00:00:00.000Z', limit: 60 });
  expect(item).toMatchObject({ actor: 'ava', reach: 'own', data: { starts_on: '2026-11-01', ends_on: '2026-11-03' } });
  call.mockResolvedValue(null);
  await undoLatest('tick', 'j1');
  expect(call).toHaveBeenLastCalledWith('undo_latest', { kind: 'tick', aboutId: 'j1' });
});

it('reads Moving on, and starts the next house from the old one', async () => {
  call.mockResolvedValue([{ fromHouseId: 'h0', houseName: 'Elm', johns: 7, leftAt: '2026-10-30T10:00:00Z', passPlan: null, passState: 'waiting', housePassUntil: null }]);
  await expect(movingOn()).resolves.toEqual({ fromHouse: 'h0', houseName: 'Elm', johns: 7, pass: 'waiting', houseKeepsUntil: null });
  call.mockResolvedValue([]);
  await expect(movingOn()).resolves.toBeNull();
  call.mockResolvedValue('h2');
  await expect(startHouseFrom('h0', { name: ' Oak ', timezone: 'Europe/London', currency: 'GBP', weekStarts: 1 })).resolves.toBe('h2');
  expect(call).toHaveBeenLastCalledWith('start_house_from', { fromId: 'h0', name: 'Oak', timezone: 'Europe/London', currency: 'GBP', weekStarts: 1 });
});

it('asks for deletion, signs out elsewhere, and reads where it stands', async () => {
  call.mockResolvedValue('2026-12-01T00:00:00Z');
  await expect(requestDeletion()).resolves.toBe('2026-12-01T00:00:00Z');
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  call.mockResolvedValue({ deleteAfter: '2026-12-01T00:00:00Z', requestedBy: 'owner' });
  await expect(deletionStatus()).resolves.toEqual({ deleteAfter: '2026-12-01T00:00:00Z', requestedBy: 'owner' });
  call.mockResolvedValue(null);
  await expect(deletionStatus()).resolves.toBeNull();
});

it('reads a connected app’s request as the approval page shows it', async () => {
  call.mockResolvedValue({
    id: 'p1',
    operation: 'deal_week',
    input: { houseId: 'h1' },
    houseId: 'h1',
    houseName: 'Elm',
    createdAt: '2026-11-01T10:00:00Z',
    expiresAt: '2026-11-01T10:10:00Z',
    approvedAt: null,
    declinedAt: null,
    usedAt: null,
  });
  await expect(readApproval('p1')).resolves.toMatchObject({ house_id: 'h1', house_name: 'Elm', expires_at: '2026-11-01T10:10:00Z', used_at: null });
  expect(call).toHaveBeenCalledWith('api_approval', { approvalId: 'p1' });
});

it('reads and saves your notification settings', async () => {
  call.mockResolvedValue({ reminders: true, checks: false, flags: true, deal: true, quietFrom: 22, quietUntil: 7, timezone: 'Europe/London' });
  await expect(loadPrefs('u1')).resolves.toMatchObject({ checks: false, quietFrom: 22, quietUntil: 7 });
  call.mockResolvedValue(null);
  await savePrefs('u1', { reminders: true, checks: true, flags: true, deal: true, quietFrom: null, quietUntil: null, timezone: null });
  expect(call).toHaveBeenLastCalledWith('save_notifications', expect.objectContaining({ quietFrom: null, quietUntil: null }));
});
