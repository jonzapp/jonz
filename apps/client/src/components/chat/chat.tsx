import { withAlpha } from "@app/core";
import { ArrowUpIcon } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";

import { Alert } from "@/components/alert";
import { ThoughtFold } from "@/components/house/thinking";
import { NO_PIECES, Reply, type ReplyPieces } from "@/components/reply/reply";
import { Body } from "@/components/text";
import {
  CONTENT_MAX,
  GUTTER,
  RADIUS,
  SECTION_GAP,
  SPACE,
  TAP,
  useTheme,
} from "@/theme";

// The chat's own pieces, shared by every chat with Jonz: a housemate's Ask
// Jonz and Describe your house (components/house/setup-chat.tsx) and the
// owner's Ask Jonz in /admin. Each chat brings its own cards and answers;
// these are the log, the bubbles, Jonz's answer and the message box, so
// they look and behave the same everywhere.

/** The box's inside height for one line: a thumb tall with its edge. */
const LINE = TAP - 2;
/** The message box at its tallest: five lines, then it scrolls. */
const BOX_MAX = LINE + 4 * 24;
/** No focus ring of the browser's own round the words: the bubble round them darkens instead. */
const NO_RING =
  Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null;
/** The send arrow's round, and its room from the bubble's edge (the same all round, one line tall). */
const SEND = 34;
const SEND_INSET = (LINE - SEND) / 2;

/**
 * The chat: its turns in a log that keeps to the newest, over whatever sits
 * at its foot (the message box, or why there isn't one), lifted clear of the
 * keyboard.
 */
export function ChatLog({
  children,
  foot,
}: {
  children: ReactNode;
  foot?: ReactNode;
}) {
  const scroll = useRef<ScrollViewInstance>(null);
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.chat}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
        testID="chat"
      >
        {children}
      </ScrollView>
      {foot}
    </KeyboardAvoidingView>
  );
}

/** What the person said: on the tint, to the right, as a chosen button sits; `children` go under the words (a report's screenshots). */
export function UserBubble({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.bubble, { backgroundColor: colors.secondary }]}
      testID="chat-user"
    >
      <Body>{text}</Body>
      {children}
    </View>
  );
}

/** Jonz's side of the chat: a greeting, or a turn's cards, stacked at the chat's own gap. */
export function Said({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.said} testID={testID}>
      {children}
    </View>
  );
}

/**
 * One answer from Jonz: how long it thought (folded), what it said (drawn
 * from Markdown, its chips and cards from `pieces`), then the turn's own
 * cards under it.
 */
export function JonzSaid({
  text,
  thought,
  pieces = NO_PIECES,
  children,
}: {
  text: string;
  /** How long Jonz thought, and the steps it showed meanwhile; a starter list has none. */
  thought?: { seconds: number; steps: string[] };
  pieces?: ReplyPieces;
  children?: ReactNode;
}) {
  return (
    <Said>
      {thought ? (
        <ThoughtFold seconds={thought.seconds} steps={thought.steps} />
      ) : null}
      {text ? (
        <Reply source={text} pieces={pieces} testID="chat-reply" />
      ) : null}
      {children}
    </Said>
  );
}

/** The bar at the chat's foot, over the edge of the log, holding the box or what stands for it. */
export function ComposerBar({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.composer,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <View style={styles.composerLine} testID={testID}>
        {children}
      </View>
    </View>
  );
}

/**
 * The message box, as in the Claude app: one bubble holding the words and
 * the send arrow at its bottom right. One line while empty, the hint cut
 * short rather than spilling; as you write it grows to show the whole
 * message, up to five lines, then scrolls inside itself.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  busy,
  placeholder,
  label,
  sendLabel,
  maxLength,
  problem,
  bare = false,
  testID = "chat",
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Jonz is answering: nothing more can be sent until it has. */
  busy: boolean;
  placeholder: string;
  /** The box's name for a screen reader. */
  label: string;
  /** The send arrow's name for a screen reader. */
  sendLabel: string;
  maxLength: number;
  /** Why the last message didn't go, over the box. */
  problem?: string | null;
  /** Without the bar: the box alone, for a page that scrolls with it (the owner's report panel). */
  bare?: boolean;
  /** Names the box `<testID>-box`, its words `-input`, the arrow `-send`, the problem `-problem`. */
  testID?: string;
}) {
  const { colors, type } = useTheme();
  // How tall the words in the box come out, measured off-screen: the box grows to fit them, up to BOX_MAX.
  const [wordsHeight, setWordsHeight] = useState(0);
  // The bubble shows the focus, not the words inside it.
  const [focused, setFocused] = useState(false);
  const box = (
    <>
      {problem ? (
        <Alert message={problem} testID={`${testID}-problem`} />
      ) : null}
      <View
        style={[
          styles.box,
          {
            borderColor: focused ? colors.foreground : colors.mutedForeground,
            backgroundColor: colors.card,
          },
        ]}
        testID={`${testID}-box`}
      >
        <View style={styles.field}>
          {/* The words as the box would wrap them, unseen, so the box can be as tall as they are. */}
          <Text
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            onLayout={(e) => setWordsHeight(e.nativeEvent.layout.height)}
            style={[styles.input, styles.measure, type.body]}
          >
            {`${value}​`}
          </Text>
          <TextInput
            accessibilityLabel={label}
            placeholder={placeholder}
            placeholderTextColor={withAlpha(colors.mutedForeground, 0.7)}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={maxLength}
            multiline
            numberOfLines={1}
            scrollEnabled
            style={[
              styles.input,
              {
                fontFamily: type.body.fontFamily,
                fontSize: type.body.fontSize,
                lineHeight: type.body.lineHeight,
              },
              {
                height: value
                  ? Math.min(Math.max(wordsHeight, LINE), BOX_MAX)
                  : LINE,
              },
              { color: colors.foreground },
              NO_RING,
            ]}
            testID={`${testID}-input`}
          />
        </View>
        <SendButton
          label={sendLabel}
          onPress={onSend}
          disabled={busy || !value.trim()}
          testID={`${testID}-send`}
        />
      </View>
    </>
  );
  return bare ? (
    <View style={styles.bare}>{box}</View>
  ) : (
    <ComposerBar>{box}</ComposerBar>
  );
}

/** The send arrow inside the message box: amber once there's something to send, quiet until then. */
function SendButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={SEND_INSET}
      testID={testID}
      style={({ pressed }) => [styles.send, pressed && { opacity: 0.85 }]}
    >
      <View
        style={[
          styles.sendDot,
          { backgroundColor: disabled ? colors.secondary : colors.hivis },
        ]}
      >
        <ArrowUpIcon
          size={18}
          color={disabled ? colors.mutedForeground : colors.onHivis}
          aria-hidden
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  chat: {
    width: "100%",
    maxWidth: CONTENT_MAX,
    alignSelf: "center",
    paddingHorizontal: GUTTER,
    paddingTop: GUTTER,
    paddingBottom: SECTION_GAP,
    gap: SPACE.xl,
  },
  said: { gap: SPACE.md },
  bubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    borderRadius: RADIUS,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    gap: SPACE.xs,
  },
  composer: { borderTopWidth: StyleSheet.hairlineWidth },
  bare: { gap: SPACE.sm },
  composerLine: {
    width: "100%",
    maxWidth: CONTENT_MAX,
    alignSelf: "center",
    paddingHorizontal: GUTTER,
    paddingVertical: SPACE.sm,
    gap: SPACE.sm,
  },
  // The bubble: its edge round the words and the send arrow, which stays at its foot as the words grow.
  box: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderRadius: RADIUS * 2,
    paddingRight: SEND_INSET,
  },
  field: { flex: 1 },
  input: {
    paddingLeft: SPACE.md,
    paddingRight: SPACE.sm,
    paddingVertical: SPACE.md - 1,
  },
  measure: { position: "absolute", left: 0, right: 0, opacity: 0 },
  // A thumb-sized target round a round arrow, sitting in the bubble's bottom-right corner.
  send: {
    width: SEND,
    height: LINE,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDot: {
    width: SEND,
    height: SEND,
    borderRadius: SEND / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
