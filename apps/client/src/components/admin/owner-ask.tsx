import { CHAT_MAX_MESSAGES, MESSAGE_MAX, OWNER_ASK_COPY, type ChatMessage } from '@app/core';
import { XIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { askOwner } from '@/api/owner';
import { ownerPieces } from '@/components/admin/owner-pieces';
import { ChatLog, Composer, JonzSaid, Said, UserBubble } from '@/components/chat/chat';
import { stepsShown, Thinking } from '@/components/house/thinking';
import { IconButton } from '@/components/icon-button';
import { Chip } from '@/components/status-mark';
import { Body, Title } from '@/components/text';
import { GUTTER, LookContext, SPACE, TAP, useTheme } from '@/theme';

/** One turn of the owner's chat: what they asked, or Jonz's answer and how long it thought. */
export type OwnerTurn = { role: 'user'; text: string } | { role: 'assistant'; text: string; thought?: { seconds: number; steps: string[] } };

const PIECES = ownerPieces();

/**
 * The owner's Ask Jonz (docs/specs/owner-admin.md, "Ask Jonz, owner"): the
 * same chat pieces as a housemate's, always in Night with an Owner chip on
 * its bar, so it's never mistaken for theirs. It asks /api/admin/ask, which
 * reads what the admin pages show and changes nothing; its chips open a
 * report, an audit entry, an account's log or an admin page.
 *
 * `turns` starts the chat (the style page's samples); `onClose` puts a close
 * button on the bar (the docked panel).
 */
export function OwnerAsk({ turns: initial = [], onClose }: { turns?: OwnerTurn[]; onClose?: () => void }) {
  return (
    <LookContext.Provider value="dark">
      <OwnerChat initial={initial} onClose={onClose} />
    </LookContext.Provider>
  );
}

function OwnerChat({ initial, onClose }: { initial: OwnerTurn[]; onClose?: () => void }) {
  const { colors } = useTheme();
  const [turns, setTurns] = useState<OwnerTurn[]>(initial);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const steps = OWNER_ASK_COPY.thinkingSteps;

  async function send() {
    const said = text.trim();
    if (!said || sending) return;
    const before = turns;
    const next: OwnerTurn[] = [...turns, { role: 'user', text: said }];
    setTurns(next);
    setText('');
    setProblem(null);
    setSending(true);
    const asked = Date.now();
    try {
      const messages: ChatMessage[] = next.map((t) => ({ role: t.role, text: t.text })).slice(-CHAT_MAX_MESSAGES);
      const answer = await askOwner(messages);
      const took = Date.now() - asked;
      setTurns([...next, { role: 'assistant', text: answer.reply, thought: { seconds: Math.max(1, Math.round(took / 1000)), steps: stepsShown(steps, took) } }]);
    } catch (reason) {
      // Refused (no code this session, too many today): what was asked goes back in the box.
      setTurns(before);
      setText(said);
      setProblem(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="owner-ask">
      <View style={[styles.bar, { borderBottomColor: colors.border }]}>
        <Title>{OWNER_ASK_COPY.title}</Title>
        <Chip label={OWNER_ASK_COPY.label} />
        <View style={styles.fill} />
        {onClose ? <IconButton icon={XIcon} label={OWNER_ASK_COPY.close} onPress={onClose} testID="owner-ask-close" /> : null}
      </View>
      <ChatLog
        foot={
          <Composer
            value={text}
            onChangeText={setText}
            onSend={() => void send()}
            busy={sending}
            placeholder={OWNER_ASK_COPY.placeholder}
            label={OWNER_ASK_COPY.box}
            sendLabel={OWNER_ASK_COPY.send}
            maxLength={MESSAGE_MAX}
            problem={problem}
          />
        }
      >
        <Said testID="owner-ask-greeting">
          <Body>{OWNER_ASK_COPY.greeting}</Body>
        </Said>
        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <UserBubble key={i} text={turn.text} />
          ) : (
            <JonzSaid key={i} text={turn.text} thought={turn.thought} pieces={PIECES} />
          ),
        )}
        {sending ? <Thinking steps={steps} /> : null}
      </ChatLog>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: TAP + SPACE.md,
    paddingHorizontal: GUTTER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
