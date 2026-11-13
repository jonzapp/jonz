import { memberCan, hasPass, type SavedTurn } from '@app/core';
import { HistoryIcon, SquarePenIcon } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadChat, type SavedChat } from '@/api/ask-chats';
import { Alert } from '@/components/alert';
import { IconButton } from '@/components/icon-button';
import { AllChats } from '@/components/house/saved-chats';
import { SetupChat } from '@/components/house/setup-chat';
import { useJohnSheetIfAny } from '@/components/john-sheet';
import { replyPieces } from '@/components/reply/pieces';
import { OutlineButton, OutlineText } from '@/components/outline';
import { ReadFailed } from '@/components/read-state';
import { Waiting } from '@/components/waiting';
import { houseChats } from '@/hooks/use-ask-chats';
import { useHouse } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useTable } from '@/hooks/use-table';
import { GUTTER, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Which chat is open: a new one, or one kept earlier; `serial` starts the
 * chat afresh on each switch. A new chat carried on from a full one opens
 * with `seed` (its summary).
 */
type Open = { serial: number; saved: SavedChat | null; seed?: SavedTurn[] };

/**
 * What the chat puts in its caller's title bar, laid out as chat apps lay
 * theirs out: `lead` (Your chats) before the Title, `actions` (New chat) on
 * the trailing edge, and on Your chats a `back` link to the chat.
 */
export interface AskBar {
  title: string;
  lead: ReactNode;
  actions: ReactNode;
  back: { label: string; onPress: () => void } | null;
}

/**
 * The chat with Jonz under a bar of the caller's own: Describe your house
 * while the list is empty, Ask Jonz once it has Johns (the title is fixed on
 * the first read, so adding Johns doesn't retitle it). The describe page
 * puts it under its title bar on a phone; from WIDE it's the right-hand
 * panel beside the page (AskPanel). `onOpenList` is the done row's way to
 * the John list. `bar` draws the title bar from an AskBar.
 *
 * Chats are kept until the person deletes them. As in ChatGPT and Claude,
 * the clock on the leading edge opens Your chats (any can be opened or
 * deleted there, with a back link to the chat), and the pencil on the
 * trailing edge starts a new one, from anywhere; a new chat's start is
 * just the greeting.
 */
export function AskJonz({
  houseId,
  userId,
  bar,
  onOpenList,
}: {
  houseId: string;
  userId: string;
  bar: (bar: AskBar) => ReactNode;
  onOpenList?: () => void;
}) {
  const words = useWords();
  const { colors } = useTheme();
  const { query, view } = useHouse(houseId, userId);
  const list = useJohnList(houseId);
  const table = useTable(houseId, query.data);
  const sheet = useJohnSheetIfAny();
  const retry = () => void Promise.all([query.refetch(), list.refetch()]);
  const ready = view !== null && list.data !== undefined;
  const [title, setTitle] = useState<string | null>(null);
  if (ready && title === null) setTitle(list.data.johns.length > 0 ? words('common.title.ask') : words('common.title.describe'));
  const [chat, setChat] = useState<Open>({ serial: 0, saved: null });
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A new chat with nothing in it has nothing for New chat to clear: the pencil waits, dimmed, until there is.
  const [talked, setTalked] = useState(false);
  const kept = useCallback((id: string) => setOpenId(id), []);

  function fresh(seed?: SavedTurn[]) {
    setChat((was) => ({ serial: was.serial + 1, saved: null, seed }));
    setOpenId(null);
    setAll(false);
    setProblem(null);
  }

  async function pickUp(id: string) {
    setProblem(null);
    try {
      const saved = await loadChat(id);
      setChat((was) => ({ serial: was.serial + 1, saved }));
      setOpenId(id);
      setAll(false);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    }
  }

  // Describe your house is a long title, and a new house's chat is one sitting: the buttons would push the
  // title into dots there. Leaving the page and coming back starts afresh.
  const describing = title === words('common.title.describe') && !all;
  const newChat = describing ? null : <IconButton icon={SquarePenIcon} label={words('ask.chats.newChat')} onPress={() => fresh()} disabled={!talked && !all} testID="chat-new" />;
  const yours =
    describing || all ? null : (
      <IconButton
        icon={HistoryIcon}
        label={words('ask.chats.open')}
        onPress={() => {
          setProblem(null);
          setAll(true);
        }}
        testID="chats-open"
      />
    );
  const chatTitle = title ?? words('common.title.ask');
  const zone = view?.snapshot.rules.timezone ?? 'UTC';
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {bar({
        title: all ? words('ask.chats.all') : chatTitle,
        lead: yours,
        actions: newChat,
        back: all ? { label: chatTitle, onPress: () => setAll(false) } : null,
      })}
      {problem ? (
        <View style={styles.reading}>
          <Alert message={problem} />
        </View>
      ) : null}
      {ready && all ? (
        <AllChats
          store={houseChats(houseId)}
          zone={zone}
          now={view.now}
          onOpen={(id) => void pickUp(id)}
          onDeleted={(id) => {
            if (id === openId) {
              setChat((was) => ({ serial: was.serial + 1, saved: null }));
              setOpenId(null);
            }
          }}
        />
      ) : ready ? (
        <SetupChat
          key={chat.serial}
          saved={chat.saved}
          seed={chat.seed}
          onCarryOn={fresh}
          onKept={kept}
          onTalked={setTalked}
          houseId={houseId}
          rules={view.snapshot.rules}
          johns={list.data.johns}
          groups={list.data.groups}
          people={view.snapshot.members}
          me={userId}
          passOpen={hasPass(view.snapshot.house.pass, view.now)}
          canChange={memberCan(view.me, 'johns:write')}
          onOpenList={onOpenList}
          pieces={replyPieces({
            viewerId: userId,
            people: view.snapshot.members.map((m) => ({ userId: m.userId, name: m.name })),
            johns: list.data.johns,
            groups: list.data.groups,
            items: view.board.items,
            rowContext: {
              houseId,
              userId,
              zone: view.snapshot.rules.timezone,
              rules: view.snapshot.rules,
              now: view.now,
              nameOf: (id) => view.snapshot.members.find((m) => m.userId === id)?.name ?? null,
            },
            balances: table.data?.balances ?? null,
            awayMakeup: view.snapshot.house.awayMakeup,
            openJohn: sheet?.open,
          }, words)}
        />
      ) : (
        <View style={[styles.reading, styles.screen]}>
          {query.isError || list.isError ? (
            <ReadFailed onRetry={retry} />
          ) : (
            // The chat in outline: Jonz's first words at the top, the box to write in at the foot.
            <Waiting
              ready={false}
              fill
              outline={
                <View style={styles.outline}>
                  <OutlineText lines={3} onCard={false} />
                  <OutlineButton />
                </View>
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  reading: { padding: GUTTER },
  outline: { flex: 1, justifyContent: 'space-between' },
});
