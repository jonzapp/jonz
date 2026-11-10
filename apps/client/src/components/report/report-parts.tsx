import { listTime, REPORT_LIMITS, type ReportState } from "@app/core";
import {
  CheckIcon,
  CircleDotIcon,
  ClockIcon,
  MessageSquareIcon,
} from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { Report, ReportDetails } from "@/api/reports";
import { Composer, UserBubble } from "@/components/chat/chat";
import { GroupItem } from "@/components/group";
import { Chip } from "@/components/status-mark";
import { Body, Meta } from "@/components/text";
import { RADIUS, SPACE, useTheme } from "@/theme";
import { Photo } from "@/components/photo";
import { useWords } from '@/hooks/use-words';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** When it was said: "16:41" today, "Thu 29 Oct, 23:58" before. */
export function said(iso: string): string {
  return listTime(iso, new Date(), zone(), false);
}

/** Where a report has got to, as the app's chips say it: Fixed is done, the rest quiet. */
export function ReportChip({
  state,
  owner = false,
  testID,
}: {
  state: ReportState;
  owner?: boolean;
  testID?: string;
}) {
  const words = useWords();
  const stateLabel = (s: ReportState) => words(owner ? (`common.report.ownerState.${s}` as const) : (`common.report.state.${s}` as const));
  if (state === "fixed")
    return (
      <Chip label={stateLabel("fixed")} icon={CheckIcon} tone="good" testID={testID} />
    );
  if (state === "replied")
    return (
      <Chip label={stateLabel("replied")} icon={MessageSquareIcon} testID={testID} />
    );
  if (owner && state === "new")
    return (
      <Chip
        label={stateLabel("new")}
        icon={CircleDotIcon}
        tone="hazard"
        testID={testID}
      />
    );
  return <Chip label={stateLabel(state)} icon={ClockIcon} testID={testID} />;
}

/** A screenshot, small, with the group's corners. */
export function Shot({
  uri,
  size = "small",
}: {
  uri: string;
  size?: "small" | "large";
}) {
  const words = useWords();
  const { colors } = useTheme();
  const box = size === "small" ? styles.small : styles.large;
  return (
    <Photo uri={uri} label={words('common.report.shot')} style={[box, styles.shot, { borderColor: colors.border }]} />
  );
}

/** What the app sends with a report, one line each: what it is, then what it said. */
export function DetailsList({ details }: { details: ReportDetails }) {
  const words = useWords();
  const lines = (["pages", "app", "house", "error"] as const).flatMap(
    (key): [string, string][] =>
      details[key] ? [[words(`common.report.detail.${key}` as const), details[key]]] : [],
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
export function ReportThread({
  report,
  viewer,
}: {
  report: Report;
  viewer: "them" | "owner";
}) {
  const words = useWords();
  return (
    <View style={styles.thread} testID="report-thread">
      {report.messages.map((message, at) => {
        const mine =
          viewer === "them" ? message.from === "them" : message.from === "jonz";
        const who =
          message.from === "jonz"
            ? message.name
              ? words('common.report.fromJonz', { name: message.name })
              : words('common.report.jonz')
            : viewer === "them"
              ? words('common.report.you')
              : (message.name ?? words('common.report.gone'));
        if (mine) {
          return (
            <View key={at} style={styles.mineWrap}>
              <Meta style={styles.right}>{`${who}, ${said(message.at)}`}</Meta>
              <UserBubble text={message.text}>
                {message.shots?.length ? (
                  <View style={styles.shots}>
                    {message.shots.map((uri) => (
                      <Shot key={uri} uri={uri} />
                    ))}
                  </View>
                ) : null}
              </UserBubble>
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
 * The box to write in: Ask Jonz's own message box (Composer), in its bar at
 * the foot of a chat, or `bare` in a page that scrolls. `onSend` sends it;
 * the box empties once it's gone, and says why if it couldn't.
 */
export function ReplyBox({
  placeholder,
  onSend,
  bare = false,
  testID = "reply-box",
  text: held,
  onChangeText,
}: {
  placeholder: string;
  onSend: (text: string) => Promise<void>;
  bare?: boolean;
  testID?: string;
  /** The words, when the page holds them (the support agent's suggestion can fill the box). */
  text?: string;
  onChangeText?: (text: string) => void;
}) {
  const words = useWords();
  const [own, setOwn] = useState("");
  const text = held ?? own;
  const setText = onChangeText ?? setOwn;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onSend(text);
      setText("");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Composer
      value={text}
      onChangeText={setText}
      onSend={() => void send()}
      busy={busy}
      placeholder={placeholder}
      label={placeholder}
      sendLabel={words('common.report.sendReply')}
      maxLength={REPORT_LIMITS.words}
      problem={problem}
      bare={bare}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  shot: { borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS },
  small: { width: 56, height: 96 },
  large: { width: 120, height: 206 },
  shots: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.xs },
  details: { gap: SPACE.xs },
  detail: { flexDirection: "row", gap: SPACE.md },
  detailLabel: { width: 84 },
  detailValue: { flex: 1 },
  thread: { gap: SPACE.xl },
  mineWrap: { alignItems: "flex-end", gap: SPACE.xs },
  right: { textAlign: "right" },
  theirs: { gap: SPACE.xs },
});
