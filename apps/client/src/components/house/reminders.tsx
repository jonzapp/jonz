import { ME_COPY, REMINDERS_COPY, BUSY_COPY } from '@app/core';
import { BellIcon, BellOffIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { reminderSupport, remindersOn, turnRemindersOff, turnRemindersOn } from '@/api/push';
import { Alert } from '@/components/alert';
import { NotificationSettings } from '@/components/house/notification-settings';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Meta, SectionLabel } from '@/components/text';
import { SPACE } from '@/theme';

/**
 * Reminders on this device, as the web's You card has them: a browser's push
 * notifications, on or off. Nothing shows where there's nothing to offer yet
 * (a phone, until native push; a build without the VAPID key). It heads
 * itself with a section label, unless `labelled` is false because something
 * round it already says Reminders (the You section's sheet, in its title).
 * Once they're on, what to send and quiet hours follow.
 */
export function Reminders({ userId, labelled = true }: { userId: string; labelled?: boolean }) {
  const support = reminderSupport();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (support !== 'ready') return;
    let alive = true;
    void remindersOn().then((now) => {
      if (alive) setOn(now);
    });
    return () => {
      alive = false;
    };
  }, [support]);

  if (support === 'none') return null;

  async function enable() {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      if ((await turnRemindersOn(userId)) === 'blocked') {
        setProblem(REMINDERS_COPY.blocked);
        return;
      }
      setOn(true);
      setNotice(REMINDERS_COPY.turnedOn);
    } catch {
      setProblem(REMINDERS_COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await turnRemindersOff();
      setOn(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack} testID="reminders">
      {labelled ? <SectionLabel>{ME_COPY.reminders}</SectionLabel> : null}
      {support === 'unsupported' ? (
        <Meta>{REMINDERS_COPY.unsupported}</Meta>
      ) : on === null ? null : on ? (
        // Across the sheet, as every sheet's buttons are.
        <ButtonRow>
          <Button variant="outline" icon={BellOffIcon} label={REMINDERS_COPY.off} busy={busy} busyLabel={BUSY_COPY.turningOff} onPress={() => void disable()} />
        </ButtonRow>
      ) : (
        <ButtonRow>
          <Button icon={BellIcon} label={REMINDERS_COPY.on} busy={busy} busyLabel={BUSY_COPY.turningOn} onPress={() => void enable()} testID="enable-push" />
        </ButtonRow>
      )}
      {problem ? <Alert message={problem} /> : null}
      <View accessibilityLiveRegion="polite">{notice ? <Meta>{notice}</Meta> : null}</View>
      {on ? <NotificationSettings userId={userId} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
});
