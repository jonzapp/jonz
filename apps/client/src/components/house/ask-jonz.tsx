import { memberCan, PAGE_TITLE, passUnlocked } from '@app/core';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { SetupChat } from '@/components/house/setup-chat';
import { useJohnSheetIfAny } from '@/components/john-sheet';
import { replyPieces } from '@/components/reply/pieces';
import { Reading, ReadFailed } from '@/components/read-state';
import { useHouse } from '@/hooks/use-house';
import { useJohnList } from '@/hooks/use-john-list';
import { useTable } from '@/hooks/use-table';
import { GUTTER, useTheme } from '@/theme';

/**
 * The chat with Jonz under a bar of the caller's own: Describe your house
 * while the list is empty, Ask Jonz once it has Johns (the title is fixed on
 * the first read, so adding Johns doesn't retitle it). The describe page
 * puts it under its title bar on a phone; from WIDE it's the right-hand
 * panel beside the page (AskPanel). `onOpenList` is the done row's way to
 * the John list.
 */
export function AskJonz({
  houseId,
  userId,
  bar,
  onOpenList,
}: {
  houseId: string;
  userId: string;
  bar: (title: string) => ReactNode;
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
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {bar(title ?? PAGE_TITLE.ask)}
      {ready ? (
        <SetupChat
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
