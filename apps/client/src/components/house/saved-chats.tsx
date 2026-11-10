import { ASK_CHATS_COPY, chatGroups, chatWhen } from '@app/core';
import { MessagesSquareIcon, Trash2Icon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet } from 'react-native';

import { type ChatStore, type ChatSummary } from '@/api/ask-chats';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Group } from '@/components/group';
import { IconButton } from '@/components/icon-button';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { OutlineGroup } from '@/components/outline';
import { ReadFailed } from '@/components/read-state';
import { Meta } from '@/components/text';
import { Waiting } from '@/components/waiting';
import { useToastIfAny } from '@/components/toast';
import { GUTTER, INSET, SECTION_GAP } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** A chat as a row: what it began with, and when it was last used. */
function ChatRow({
  chat,
  now,
  zone,
  onOpen,
  trailing,
}: {
  chat: ChatSummary;
  now: Date;
  zone: string;
  onOpen: (id: string) => void;
  trailing: ReactNode;
}) {
  return (
    <Row
      title={chat.title}
      titleLines={2}
      meta={chatWhen(new Date(chat.updatedAt), now, zone)}
      leading={<RowIcon icon={MessagesSquareIcon} />}
      trailing={trailing}
      onPress={() => onOpen(chat.id)}
      testID="saved-chat"
    />
  );
}

/**
 * Your chats, from the clock in Ask Jonz's bar (which titles it, with the
 * way back to the chat): every one you've kept in this house, the latest
 * first, under Today, Last 7 days and Earlier, as chat apps list them.
 * Open one to carry on with it, or delete it (after a sheet that says it's
 * gone for good). `onDeleted` lets the chat that's open start afresh when
 * it's the one deleted. `store` is where the chats are kept: a house's
 * (houseChats) or the owner's own (ownerChats), the same list for both.
 */
export function AllChats({
  store,
  zone,
  now,
  onOpen,
  onDeleted,
  note = ASK_CHATS_COPY.allNote,
  deleteBody = ASK_CHATS_COPY.deleteBody,
}: {
  store: ChatStore;
  zone: string;
  now: Date;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
  /** The line under the list, and the delete sheet's words: a house's say what leaving it does. */
  note?: string;
  deleteBody?: string;
}) {
  const words = useWords();
  const chats = useQuery({ queryKey: store.key, queryFn: store.list });
  const client = useQueryClient();
  const toast = useToastIfAny();
  const [doomed, setDoomed] = useState<ChatSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = chats.data ?? [];

  async function remove() {
    if (!doomed) return;
    const id = doomed.id;
    setPending(true);
    setProblem(null);
    try {
      await store.remove(id);
      await client.invalidateQueries({ queryKey: store.key });
      setDoomed(null);
      onDeleted(id);
      toast?.show(ASK_CHATS_COPY.deleted);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} testID="all-chats">
      {chats.data === undefined ? (
        chats.isError ? (
          <ReadFailed message={ASK_CHATS_COPY.unreadable} onRetry={() => void chats.refetch()} />
        ) : (
          // The chats in outline: a label and a few rows, the way a day's group of them looks.
          <Waiting
            ready={false}
            label={ASK_CHATS_COPY.reading}
            outline={
<OutlineGroup rows={4} lead="none" end />
            }
          />
        )
      ) : list.length === 0 ? (
        <Group>
          <Row title={ASK_CHATS_COPY.none} titleLines={2} testID="chats-none" />
        </Group>
      ) : (
        chatGroups(list, now, zone).map((group) => (
          <Section key={group.label} label={group.label} testID="chats-group">
            {group.chats.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                now={now}
                zone={zone}
                onOpen={onOpen}
                trailing={
                  <IconButton
                    icon={Trash2Icon}
                    label={ASK_CHATS_COPY.deleteChat(c.title)}
                    onPress={() => setDoomed(c)}
                    testID="chat-delete"
                  />
                }
              />
            ))}
          </Section>
        ))
      )}
      <Meta style={styles.note}>{note}</Meta>
      <ConfirmSheet
        visible={doomed !== null}
        title={ASK_CHATS_COPY.deleteTitle}
        body={deleteBody}
        confirmLabel={ASK_CHATS_COPY.delete}
        icon={Trash2Icon}
        busy={pending}
        busyLabel={words('common.busy.deleting')}
        problem={problem}
        onConfirm={() => void remove()}
        onClose={() => setDoomed(null)}
        testID="chat-delete-sheet"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: GUTTER, gap: SECTION_GAP },
  note: { paddingHorizontal: INSET },
});
