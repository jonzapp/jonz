import { ASK_CHATS_COPY, memberCan, PAGE_TITLE, passUnlocked } from '@app/core';
import { SquarePenIcon } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { loadChat, type SavedChat } from '@/api/ask-chats';
import { Alert } from '@/components/alert';
import { IconButton } from '@/components/icon-button';
import { AllChats, RecentChats } from '@/components/house/saved-chats';
import { SetupChat } from '@/components/house/setup-chat';
import { useJohnSheetIfAny } from '@/components/john-sheet';
import { replyPieces } from '@/components/reply/pieces';
import { Reading, ReadFailed } from '@/components/read-state';
import { useHouse } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useTable } from '@/hooks/use-table';
import { GUTTER, useTheme } from '@/theme';

/** Which chat is open: a new one, or one kept earlier; `serial` starts the chat afresh on each switch. */
type Open = { serial: number; saved: SavedChat | null };

/**
 * The chat with Jonz under a bar of the caller's own: Describe your house
 * while the list is empty, Ask Jonz once it has Johns (the title is fixed on
 * the first read, so adding Johns doesn't retitle it). The describe page
 * puts it under its title bar on a phone; from WIDE it's the right-hand
 * panel beside the page (AskPanel). `onOpenList` is the done row's way to
 * the John list. `bar` gets the title and New chat, for its right-hand side.
 *
 * Chats are kept until the person deletes them: the start shows the latest
 * few to pick up again, and See all opens Your chats, where any can be
 * opened or deleted.
 */
export function AskJonz({
  houseId,
  userId,
  bar,
  onOpenList,
}: {
  houseId: string;
  userId: string;
  bar: (title: string, actions: ReactNode) => ReactNode;
  onOpenList?: () => void;
}) {
  const { colors } = useTheme();
  const { query, view } = useHouse(houseId, userId);
  const list = useJohnList(houseId);
  const table = useTable(houseId, query.data);
  const sheet = useJohnSheetIfAny();
  const retry = () => void Promise.all([query.refetch(), list.refetch()]);
  const ready = view !== null && list.data !== undefined;
  const [title, setTitle] = useState<string | null>(null);
  if (ready && title === null) setTitle(list.data.johns.length > 0 ? PAGE_TITLE.ask : PAGE_TITLE.describe);
  const [chat, setChat] = useState<Open>({ serial: 0, saved: null });
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
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
      const saved = await loadChat(id);
      setChat((was) => ({ serial: was.serial + 1, saved }));
      setOpenId(id);
      setAll(false);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    }
  }

  // Describe your house is a long title, and a new house's chat is one sitting: New chat would push the
  // title into dots there. Leaving the page and coming back starts afresh, with the kept chats on its start.
  const newChat =
    title === PAGE_TITLE.describe && !all ? null : (
      <IconButton icon={SquarePenIcon} label={ASK_CHATS_COPY.newChat} onPress={fresh} testID="chat-new" />
    );
  const zone = view?.snapshot.rules.timezone ?? 'UTC';
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {bar(all ? ASK_CHATS_COPY.all : (title ?? PAGE_TITLE.ask), newChat)}
      {problem ? (
        <View style={styles.reading}>
          <Alert message={problem} />
        </View>
      ) : null}
      {ready && all ? (
        <AllChats
          houseId={houseId}
          zone={zone}
          now={view.now}
          onOpen={(id) => void pickUp(id)}
          onBack={() => setAll(false)}
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
          onKept={kept}
          recent={
            <RecentChats houseId={houseId} zone={zone} now={view.now} onOpen={(id) => void pickUp(id)} onSeeAll={() => setAll(true)} />
          }
          houseId={houseId}
          rules={view.snapshot.rules}
          johns={list.data.johns}
          groups={list.data.groups}
          people={view.snapshot.members}
          me={userId}
          passOpen={passUnlocked(view.snapshot.house.pass, view.now)}
          canChange={memberCan(view.me, 'johns.edit')}
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
          })}
        />
      ) : (
        <View style={styles.reading}>{query.isError || list.isError ? <ReadFailed onRetry={retry} /> : <Reading />}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  reading: { padding: GUTTER },
});
