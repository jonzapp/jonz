import { NOTIFY_COPY, PUSH_KINDS, type NotificationPrefs, type PushKind } from '@app/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadPrefs, savePrefs } from '@/api/notification-prefs';
import { Alert } from '@/components/alert';
import { Row } from '@/components/row';
import { Segmented } from '@/components/segmented';
import { Meta, SectionLabel } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';

const ON_OFF = [
  { value: 'on', label: NOTIFY_COPY.on },
  { value: 'off', label: NOTIFY_COPY.off },
] as const;

const QUIET = NOTIFY_COPY.quietOptions.map((o, i) => ({ value: i, label: o.label }));

/** Which of the offered quiet hours these are; anything else reads as the first set. */
function quietIndex(prefs: NotificationPrefs): number {
  if (prefs.quietFrom === null) return 0;
  const i = NOTIFY_COPY.quietOptions.findIndex((o) => o.from === prefs.quietFrom && o.until === prefs.quietUntil);
  return i === -1 ? 1 : i;
}

/**
 * What to push you, kind by kind, and quiet hours: yours on every device
 * (notification_prefs). Each change saves at once; a save that fails puts
 * the switch back and says so.
 */
export function NotificationSettings({ userId }: { userId: string }) {
  const words = useWords();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPrefs(userId)
      .then((p) => alive && setPrefs(p))
      .catch(() => alive && setProblem(NOTIFY_COPY.failed));
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!prefs) return problem ? <Alert message={problem} /> : null;

  async function change(next: NotificationPrefs) {
    const before = prefs!;
    setPrefs(next);
    setProblem(null);
    setNotice(null);
    try {
      await savePrefs(userId, next);
      setNotice(NOTIFY_COPY.saved);
    } catch {
      setPrefs(before);
      setProblem(NOTIFY_COPY.failed);
    }
  }

  const setKind = (kind: PushKind, on: boolean) => void change({ ...prefs, [kind]: on });
  const setQuiet = (i: number) => {
    const o = NOTIFY_COPY.quietOptions[i];
    void change({ ...prefs, quietFrom: o.from, quietUntil: o.until });
  };

  return (
    <View style={styles.stack} testID="notification-settings">
      <SectionLabel>{NOTIFY_COPY.settings}</SectionLabel>
      <View>
        {PUSH_KINDS.map((kind) => (
          <Row
            key={kind}
            title={words(`house.notify.kind.${kind}`)}
            meta={words(`house.notify.hint.${kind}`)}
            metaLines={2}
            trailing={
              <Segmented
                options={ON_OFF}
                value={prefs[kind] ? 'on' : 'off'}
                onChange={(v) => setKind(kind, v === 'on')}
                label={words(`house.notify.kind.${kind}`)}
                testID={`push-${kind}`}
              />
            }
          />
        ))}
      </View>
      <SectionLabel>{NOTIFY_COPY.quiet}</SectionLabel>
      <Segmented options={QUIET} value={quietIndex(prefs)} onChange={setQuiet} label={NOTIFY_COPY.quiet} equal testID="quiet-hours" />
      <Meta>{NOTIFY_COPY.quietHint}</Meta>
      {problem ? <Alert message={problem} /> : null}
      <View accessibilityLiveRegion="polite">{notice ? <Meta>{notice}</Meta> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
});
