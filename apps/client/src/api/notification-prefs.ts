import { NotificationPrefsDraft, prefsOf, type NotificationPrefs } from '@app/core';

import { callV1 } from './v1';

// What to push you and when to keep quiet: your own row in
// notification_prefs, the same on every device. No row reads as everything
// on, so the first save makes it.

/** Your settings, or the defaults if you've never changed them. */
export async function loadPrefs(_userId: string): Promise<NotificationPrefs> {
  const row = await callV1('my_notifications', {});
  return prefsOf(row && { ...row, quiet_from: row.quietFrom, quiet_until: row.quietUntil });
}

/** This device's time zone, which quiet hours are read in. */
function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Save them all at once. Quiet hours are kept in this device's zone. */
export async function savePrefs(_userId: string, prefs: NotificationPrefs): Promise<void> {
  const parsed = NotificationPrefsDraft.safeParse({ ...prefs, timezone: deviceZone() ?? prefs.timezone });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const p = parsed.data;
  await callV1('save_notifications', {
    reminders: p.reminders,
    checks: p.checks,
    flags: p.flags,
    deal: p.deal,
    quietFrom: p.quietFrom,
    quietUntil: p.quietUntil,
    timezone: p.timezone,
  });
}
