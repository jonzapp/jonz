import { PUSH_KINDS, type NotificationPrefs, type PushKind } from '@app/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadPrefs, savePrefs } from '@/api/notification-prefs';
import { Alert } from '@/components/alert';
import { CardRows } from '@/components/group';
import { Row } from '@/components/row';
import { Segmented } from '@/components/segmented';
import { Switch } from '@/components/switch';
import { Meta, SectionLabel } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { INSET, SPACE } from '@/theme';

/** The quiet hours on offer, from and until, on the hour; the first is none. */
const QUIET_HOURS: readonly { from: number | null; until: number | null }[] = [
  { from: null, until: null },
  { from: 22, until: 7 },
  { from: 23, until: 8 },
];

const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Which of the offered quiet hours these are; anything else reads as the first set. */
function quietIndex(prefs: NotificationPrefs): number {
  if (prefs.quietFrom === null) return 0;
  const i = QUIET_HOURS.findIndex((o) => o.from === prefs.quietFrom && o.until === prefs.quietUntil);
  return i === -1 ? 1 : i;
}

/**
 * What to push you, kind by kind, and quiet hours: yours on every device
 * (notification_prefs). Each kind is a Switch and saves at once; a save
 * that fails puts the switch back and says so.
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
      .catch(() => alive && setProblem(words('house.notify.failed')));
    return () => {
      alive = false;
    };
  }, [userId, words]);

  if (!prefs) return problem ? <Alert message={problem} /> : null;

  async function change(next: NotificationPrefs) {
    const before = prefs!;
    setPrefs(next);
    setProblem(null);
    setNotice(null);
    try {
      await savePrefs(userId, next);
      setNotice(words('house.notify.saved'));
    } catch {
      setPrefs(before);
      setProblem(words('house.notify.failed'));
    }
  }

  const setKind = (kind: PushKind, on: boolean) => void change({ ...prefs, [kind]: on });
  const setQuiet = (i: number) => {
    const o = QUIET_HOURS[i];
    void change({ ...prefs, quietFrom: o.from, quietUntil: o.until });
  };

  return (
    <View style={styles.stack} testID="notification-settings">
      <SectionLabel>{words('house.notify.settings')}</SectionLabel>
      <View style={styles.rows}>
        <CardRows>
          {PUSH_KINDS.map((kind) => (
            <Row
              key={kind}
              title={words(`house.notify.kind.${kind}`)}
              meta={words(`house.notify.hint.${kind}`)}
              metaLines={2}
              trailing={<Switch value={prefs[kind]} onChange={(on) => setKind(kind, on)} label={words(`house.notify.kind.${kind}`)} testID={`push-${kind}`} />}
            />
          ))}
        </CardRows>
      </View>
      <SectionLabel>{words('house.notify.quiet')}</SectionLabel>
      <Segmented options={QUIET_HOURS.map((o, i) => ({
          value: i,
          label: o.from === null || o.until === null ? words('house.notify.quietOptions.off') : `${hour(o.from)}–${hour(o.until)}`,
        }))} value={quietIndex(prefs)} onChange={setQuiet} label={words('house.notify.quiet')} equal testID="quiet-hours" />
      <Meta>{words('house.notify.quietHint')}</Meta>
      {problem ? <Alert message={problem} /> : null}
      <View accessibilityLiveRegion="polite">{notice ? <Meta>{notice}</Meta> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
  /** The rows line up with the sheet's edges, as a card's do; the section label above already spaces them. */
  rows: { marginTop: -INSET },
});
