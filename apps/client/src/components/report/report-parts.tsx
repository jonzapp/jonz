import { listTime, REPORT_COPY, REPORT_LIMITS, withAlpha, type ReportState } from '@app/core';
import { ArrowUpIcon, CheckIcon, CircleDotIcon, ClockIcon, MessageSquareIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { Report, ReportDetails } from '@/api/reports';
import { Alert } from '@/components/alert';
import { GroupItem } from '@/components/group';
import { Chip } from '@/components/status-mark';
import { Body, Meta } from '@/components/text';
import { RADIUS, SPACE, TAP, useTheme } from '@/theme';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** When it was said: "16:41" today, "Thu 29 Oct, 23:58" before. */
export function said(iso: string): string {
  return listTime(iso, new Date(), zone(), false);
}

/** Where a report has got to, as the app's chips say it: Fixed is done, the rest quiet. */
export function ReportChip({ state, owner = false, testID }: { state: ReportState; owner?: boolean; testID?: string }) {
  const words = owner ? REPORT_COPY.ownerState : REPORT_COPY.state;
  if (state === 'fixed') return <Chip label={words.fixed} icon={CheckIcon} tone="good" testID={testID} />;
  if (state === 'replied') return <Chip label={words.replied} icon={MessageSquareIcon} testID={testID} />;
  if (owner && state === 'new') return <Chip label={words.new} icon={CircleDotIcon} tone="hazard" testID={testID} />;
  return <Chip label={words[state]} icon={ClockIcon} testID={testID} />;
}

/** A screenshot, small, with the group's corners. */
export function Shot({ uri, size = 'small' }: { uri: string; size?: 'small' | 'large' }) {
  const { colors } = useTheme();
  const box = size === 'small' ? styles.small : styles.large;
  return <Image source={{ uri }} style={[box, styles.shot, { borderColor: colors.border }]} resizeMode="cover" accessibilityLabel="Screenshot" />;
}

/** What the app sends with a report, one line each: what it is, then what it said. */
export function DetailsList({ details }: { details: ReportDetails }) {
  const lines = (['pages', 'app', 'house', 'error'] as const).flatMap((key): [string, string][] =>
    details[key] ? [[REPORT_COPY.detail[key], details[key]]] : [],
  );
  return (
    <GroupItem testID="report-details">
      <View style={styles.details}>
        {lines.map(([label, value]) => (
          <View key={label + value} style={styles.detail}>
            <Meta style={styles.detailLabel}>{label}</Meta>
            <Meta style={styles.detailValue}>{value}</Meta>
          </View>
        ))}
      </View>
    </GroupItem>
  );
}

/**
 * A report's conversation, as the setup chat draws one: what the viewer
 * said in a bubble on the tint, at the right; what the other side said as
 * plain words at the left, under who said it and when.
 */
export function ReportThread({ report, viewer }: { report: Report; viewer: 'them' | 'owner' }) {
  const { colors } = useTheme();
  return (
    <View style={styles.thread} testID="report-thread">
      {report.messages.map((message, at) => {
        const mine = viewer === 'them' ? message.from === 'them' : message.from === 'jonz';
        const who =
          message.from === 'jonz'
            ? message.name
              ? REPORT_COPY.fromJonz(message.name)
              : REPORT_COPY.jonz
            : viewer === 'them'
              ? REPORT_COPY.you
              : (message.name ?? REPORT_COPY.gone);
        if (mine) {
          return (
            <View key={at} style={styles.mineWrap}>
              <Meta style={styles.right}>{`${who}, ${said(message.at)}`}</Meta>
              <View style={[styles.bubble, { backgroundColor: colors.secondary }]}>
                <Body>{message.text}</Body>
                {message.shots?.length ? (
                  <View style={styles.shots}>
                    {message.shots.map((uri) => (
                      <Shot key={uri} uri={uri} />
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          );
        }
        return (
          <View key={at} style={styles.theirs}>
            <Meta>{`${who}, ${said(message.at)}`}</Meta>
            <Body>{message.text}</Body>
            {message.shots?.length ? (
              <View style={styles.shots}>
                {message.shots.map((uri) => (
                  <Shot key={uri} uri={uri} size="large" />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The box to write in, as Ask Jonz's: one rounded edge, the amber arrow
 * inside it once there's something to send. `onSend` sends it; the box
 * empties once it's gone, and says why if it couldn't.
 */
export function ReplyBox({
  placeholder,
  onSend,
  testID = 'reply-box',
  text: held,
  onChangeText,
}: {
  placeholder: string;
  onSend: (text: string) => Promise<void>;
  testID?: string;
  /** The words, when the page holds them (the support agent's suggestion can fill the box). */
  text?: string;
  onChangeText?: (text: string) => void;
}) {
  const { colors, type } = useTheme();
  const [own, setOwn] = useState('');
  const text = held ?? own;
  const setText = onChangeText ?? setOwn;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = text.trim().length > 0 && !busy;
  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onSend(text);
      setText('');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.reply}>
      <View style={[styles.box, { borderColor: colors.mutedForeground, backgroundColor: colors.card }]} testID={testID}>
        <TextInput
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor={withAlpha(colors.mutedForeground, 0.8)}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={REPORT_LIMITS.words}
          editable={!busy}
          style={[styles.input, { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize, color: colors.foreground }]}
          testID={`${testID}-input`}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={REPORT_COPY.sendReply}
          disabled={!ready}
          onPress={() => void send()}
          style={styles.send}
          testID={`${testID}-send`}
        >
          <View style={[styles.sendDot, { backgroundColor: ready ? colors.hivis : colors.secondary }]}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <ArrowUpIcon size={18} color={ready ? colors.onHivis : colors.mutedForeground} aria-hidden />
            )}
          </View>
        </Pressable>
      </View>
      {problem ? <Alert message={problem} testID={`${testID}-problem`} /> : null}
    </View>
  );
}

const SEND = 32;

const styles = StyleSheet.create({
  shot: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS },
  small: { width: 56, height: 96 },
  large: { width: 120, height: 206 },
  shots: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
  details: { gap: SPACE.xs },
  detail: { flexDirection: 'row', gap: SPACE.md },
  detailLabel: { width: 84 },
  detailValue: { flex: 1 },
  thread: { gap: SPACE.xl },
  reply: { gap: SPACE.sm },
  mineWrap: { alignItems: 'flex-end', gap: SPACE.xs },
  right: { textAlign: 'right' },
  bubble: { maxWidth: '85%', borderRadius: RADIUS, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, gap: SPACE.xs },
  theirs: { gap: SPACE.xs },
  box: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: RADIUS * 2, paddingRight: SPACE.sm, minHeight: TAP },
  input: { flex: 1, paddingLeft: SPACE.md, paddingRight: SPACE.sm, paddingVertical: SPACE.md - 1, minHeight: TAP },
  send: { width: SEND, height: TAP, alignItems: 'center', justifyContent: 'center' },
  sendDot: { width: SEND, height: SEND, borderRadius: SEND / 2, alignItems: 'center', justifyContent: 'center' },
});
