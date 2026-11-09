import { REPORT_COPY, REPORT_KINDS, REPORT_LIMITS, withAlpha, type ReportKind } from '@app/core';
import { ImagePlusIcon, SendIcon, XIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { reportDetails } from '@/api/report-details';
import { pickScreenshot, sendReport } from '@/api/reports';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field, FieldLabel } from '@/components/field';
import { Group } from '@/components/group';
import { DetailsList, Shot } from '@/components/report/report-parts';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Meta } from '@/components/text';
import { RADIUS, SPACE, useTheme } from '@/theme';

const KINDS = REPORT_KINDS.map((value) => ({ value, label: REPORT_COPY.kind[value] }));

/**
 * Report a problem, send an idea or ask a question, in a sheet: what kind,
 * the words, up to three screenshots, and the details the app sends with it,
 * listed so it's plain what goes and with a box to leave them out. One
 * amber button sends it; the line under it says where the answer comes.
 */
export function ReportForm({ start, house, onSent }: { start: ReportKind; house: string | null; onSent: (id: string) => void }) {
  const { colors, scheme } = useTheme();
  const [kind, setKind] = useState<ReportKind>(start);
  const [text, setText] = useState('');
  const [shots, setShots] = useState<string[]>([]);
  const [send, setSend] = useState(true);
  // What it would send, as it was when the sheet opened: the page they came from, not this sheet.
  const [details] = useState(() => reportDetails(house));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    setProblem(null);
    try {
      const uri = await pickScreenshot();
      if (uri) setShots((now) => [...now, uri].slice(0, REPORT_LIMITS.shots));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onSent(await sendReport({ kind, words: text, details: send ? details : null, shots }));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.form} testID="report-form">
      <Segmented options={KINDS} value={kind} onChange={setKind} label={REPORT_COPY.kindLabel} equal testID="report-kind" />
      <Field
        label={REPORT_COPY.words[kind]}
        placeholder={REPORT_COPY.placeholder[kind]}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={REPORT_LIMITS.words}
        testID="report-words"
      />
      <View style={styles.shots}>
        <FieldLabel>{REPORT_COPY.screenshots}</FieldLabel>
        <View style={styles.shotRow}>
          {shots.map((uri, at) => (
            <Pressable
              key={uri}
              accessibilityRole="button"
              accessibilityLabel={REPORT_COPY.removeScreenshot(at + 1)}
              onPress={() => setShots((now) => now.filter((one) => one !== uri))}
              testID={`report-shot-${at}`}
            >
              <Shot uri={uri} />
              <View style={[styles.remove, { backgroundColor: colors.foreground }]}>
                <XIcon size={12} color={colors.background} aria-hidden />
              </View>
            </Pressable>
          ))}
          {shots.length < REPORT_LIMITS.shots ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={REPORT_COPY.addScreenshot}
              onPress={() => void add()}
              style={[styles.add, { borderColor: colors.mutedForeground, backgroundColor: withAlpha(colors.card, scheme === 'dark' ? 0.6 : 1) }]}
              testID="report-add-shot"
            >
              <ImagePlusIcon size={22} color={colors.mutedForeground} aria-hidden />
            </Pressable>
          ) : null}
          <Meta style={styles.shotNote}>{REPORT_COPY.screenshotsNote}</Meta>
        </View>
      </View>
      <Group testID="report-send-details">
        <ChoiceRow role="checkbox" label={REPORT_COPY.details} meta={REPORT_COPY.detailsMeta} checked={send} onPress={() => setSend((on) => !on)} />
        {send ? <DetailsList details={details} /> : null}
      </Group>
      <View style={styles.end}>
        {problem ? <Alert message={problem} testID="report-problem" /> : null}
        <ButtonRow>
          <Button
            label={REPORT_COPY.send[kind]}
            busyLabel={REPORT_COPY.sending}
            icon={SendIcon}
            busy={busy}
            disabled={!text.trim()}
            onPress={() => void submit()}
            testID="report-send"
          />
        </ButtonRow>
        <Meta>{REPORT_COPY.promise}</Meta>
      </View>
    </View>
  );
}

const SHOT_W = 56;

const styles = StyleSheet.create({
  form: { gap: SPACE.lg },
  shots: { gap: SPACE.sm },
  shotRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  add: { width: SHOT_W, height: 96, borderRadius: RADIUS, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: SPACE.xs, right: SPACE.xs, width: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  shotNote: { flex: 1, marginLeft: SPACE.xs },
  end: { gap: SPACE.sm, marginTop: SPACE.xs },
});
