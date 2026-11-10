import { ASK_CHATS_COPY, CHAT_MAX_MESSAGES, MESSAGE_MAX, OWNER_ASK_COPY, type ChatMessage, type OwnerMove, type SavedTurn } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import { HistoryIcon, SquarePenIcon, XIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { ChatStore, SavedChat } from '@/api/ask-chats';
import { askOwner, ownerChats } from '@/api/owner';
import { ownerZone } from '@/components/admin/audit-entry';
import { OwnerMovesCard } from '@/components/admin/owner-moves-card';
import { ownerPieces } from '@/components/admin/owner-pieces';
import { Alert } from '@/components/alert';
import { ChatLog, Composer, JonzSaid, Said, UserBubble } from '@/components/chat/chat';
import { AllChats } from '@/components/house/saved-chats';
import { stepsShown, Thinking } from '@/components/house/thinking';
import { IconButton } from '@/components/icon-button';
import { Chip } from '@/components/status-mark';
import { Body } from '@/components/text';
import { BarEdgeContext, TitleBar } from '@/components/title-bar';
import { GUTTER, LookContext, SPACE, useTheme, WIDE } from '@/theme';

/** One turn of the owner's chat: what they asked, or Jonz's answer, how long it thought, and what it put on the card. */
export type OwnerTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; thought?: { seconds: number; steps: string[] }; moves?: OwnerMove[] };

const PIECES = ownerPieces();

/** A kept chat's turns as the chat shows them (how long Jonz thought isn't kept, nor its cards: they were for then). */
function fromSaved(saved: readonly SavedTurn[]): OwnerTurn[] {
  return saved.flatMap((t): OwnerTurn[] => (t.role === 'user' || t.role === 'assistant' ? [{ role: t.role, text: t.text }] : []));
}

/** The chat as it's kept: the same turns a housemate's chat keeps; a card is kept as having been there. */
function toSaved(turns: readonly OwnerTurn[]): SavedTurn[] {
  return turns.map((t) =>
    t.role === 'user' ? { role: 'user', text: t.text } : { role: 'assistant', text: t.text, ask: null, hadCard: Boolean(t.moves?.length) },
  );
}

/** Which chat is open: a new one, or one kept earlier; `serial` starts the chat afresh on each switch. */
type Open = { serial: number; saved: SavedChat | null };

/**
 * The owner's Ask Jonz (docs/specs/owner-admin.md, "Ask Jonz, owner"): the
 * same chat pieces as a housemate's, always in Night with Owner under the
 * title on its bar, so it's never mistaken for theirs. It asks /api/admin/ask, which
 * reads what the admin pages show and puts anything to do on a card (the
 * house's MovesCard's twin): nothing changes until the owner taps it. Its
 * chips open a report, an audit entry, an account's log or an admin page.
 *
 * Its chats are kept as a housemate's are, in the owner's own table: the
 * same bar (the clock before the title opens Your chats, the pencil starts a
 * new one) and the same Your chats list, with Delete.
 *
 * `turns` starts the chat (the style page's samples); `onClose` puts a close
 * button on the bar (the docked panel); `store` is where chats are kept.
 */
export function OwnerAsk({ turns: initial = [], onClose, store = ownerChats }: { turns?: OwnerTurn[]; onClose?: () => void; store?: ChatStore }) {
  return (
    <LookContext.Provider value="dark">
      <BarEdgeContext.Provider value={null}>
        <OwnerChats initial={initial} onClose={onClose} store={store} />
      </BarEdgeContext.Provider>
    </LookContext.Provider>
  );
}

function OwnerChats({ initial, onClose, store }: { initial: OwnerTurn[]; onClose?: () => void; store: ChatStore }) {
  const { colors } = useTheme();
  // Docked beside the page from WIDE: its bar stays as tall as the page's.
  const docked = useWindowDimensions().width >= WIDE;
  const [chat, setChat] = useState<Open>({ serial: 0, saved: null });
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A new chat with nothing in it has nothing for New chat to clear: the pencil waits, dimmed, until there is.
  const [talked, setTalked] = useState(initial.length > 0);
  const kept = useCallback((id: string) => setOpenId(id), []);

  function fresh() {
    setChat((was) => ({ serial: was.serial + 1, saved: null }));
    setOpenId(null);
    setAll(false);
    setProblem(null);
  }

  async function pickUp(id: string) {
    setProblem(null);
    try {
      const saved = await store.load(id);
      setChat((was) => ({ serial: was.serial + 1, saved }));
      setOpenId(id);
      setAll(false);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const tools = (
    <View style={styles.tools}>
      <IconButton icon={SquarePenIcon} label={ASK_CHATS_COPY.newChat} onPress={fresh} disabled={!talked && !all} testID="chat-new" />
      {onClose ? <IconButton icon={XIcon} label={OWNER_ASK_COPY.close} onPress={onClose} testID="owner-ask-close" /> : null}
    </View>
  );
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="owner-ask">
      <TitleBar
        title={all ? ASK_CHATS_COPY.all : OWNER_ASK_COPY.title}
        // Docked, the bar keeps to one line like the page's; the Owner label goes just under it.
        sub={docked ? undefined : OWNER_ASK_COPY.label}
        docked={docked}
        lead={
          all ? undefined : (
            <IconButton
              icon={HistoryIcon}
              label={ASK_CHATS_COPY.open}
              onPress={() => {
                setProblem(null);
                setAll(true);
              }}
              testID="chats-open"
            />
          )
        }
        onBack={all ? () => setAll(false) : undefined}
        backLabel={all ? OWNER_ASK_COPY.title : undefined}
        right={tools}
      />
      {docked ? (
        <View style={styles.owner}>
          <Chip label={OWNER_ASK_COPY.label} testID="owner-ask-label" />
        </View>
      ) : null}
      {problem ? (
        <View style={styles.problem}>
          <Alert message={problem} />
        </View>
      ) : null}
      {all ? (
        <AllChats
          store={store}
          zone={ownerZone()}
          now={new Date()}
          onOpen={(id) => void pickUp(id)}
          onDeleted={(id) => {
            if (id === openId) {
              setChat((was) => ({ serial: was.serial + 1, saved: null }));
              setOpenId(null);
            }
          }}
          note={OWNER_ASK_COPY.chatsNote}
          deleteBody={OWNER_ASK_COPY.deleteBody}
        />
      ) : (
        <OwnerChat
          key={chat.serial}
          initial={chat.saved ? fromSaved(chat.saved.turns) : chat.serial === 0 ? initial : []}
          savedId={chat.saved?.id ?? null}
          store={store}
          onKept={kept}
          onTalked={setTalked}
        />
      )}
    </View>
  );
}

function OwnerChat({
  initial,
  savedId,
  store,
  onKept,
  onTalked,
}: {
  initial: OwnerTurn[];
  savedId: string | null;
  store: ChatStore;
  onKept: (id: string) => void;
  onTalked: (talked: boolean) => void;
}) {
  const client = useQueryClient();
  const [turns, setTurns] = useState<OwnerTurn[]>(initial);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const steps = OWNER_ASK_COPY.thinkingSteps;
  const chatId = useRef(savedId);
  // Keeping goes one at a time, so the first answer's new row is the one the next answer updates.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const unkept = useRef(false);
  const talked = turns.length > 0 || text.trim() !== '';
  useEffect(() => onTalked(talked), [talked, onTalked]);

  // Each answer keeps the chat as it now is. A chat that can't be kept carries on regardless:
  // keeping is for coming back to it, never in the way of it.
  useEffect(() => {
    if (!unkept.current || turns.length === 0) return;
    unkept.current = false;
    const kept = toSaved(turns);
    queue.current = queue.current.then(async () => {
      try {
        chatId.current = await store.keep(chatId.current, kept);
        onKept(chatId.current);
        await client.invalidateQueries({ queryKey: store.key });
      } catch {
        // Not kept this time; the next answer tries again with the whole chat.
        unkept.current = true;
      }
    });
  }, [turns, store, client, onKept]);

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
      unkept.current = true;
      setTurns([
        ...next,
        {
          role: 'assistant',
          text: answer.reply,
          thought: { seconds: Math.max(1, Math.round(took / 1000)), steps: stepsShown(steps, took) },
          ...(answer.moves?.length ? { moves: answer.moves } : {}),
        },
      ]);
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
    <View style={styles.screen}>
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
            <JonzSaid key={i} text={turn.text} thought={turn.thought} pieces={PIECES}>
              {turn.moves?.length ? <OwnerMovesCard items={turn.moves} /> : null}
            </JonzSaid>
          ),
        )}
        {sending ? <Thinking steps={steps} /> : null}
      </ChatLog>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  problem: { padding: GUTTER },
  // The Owner label under a docked bar, on the chat's leading edge, as far down as the page's first line.
  owner: { flexDirection: 'row', paddingHorizontal: GUTTER, paddingTop: SPACE.lg },
});
