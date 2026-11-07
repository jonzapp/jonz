import { ASK_CHATS_COPY, chatGroups, chatWhen } from '@app/core';
import { MessagesSquareIcon, Trash2Icon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { deleteChat, type ChatSummary } from '@/api/ask-chats';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { IconButton } from '@/components/icon-button';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Meta } from '@/components/text';
import { useToastIfAny } from '@/components/toast';
import { useAskChats } from '@/hooks/use-ask-chats';
import { useMove } from '@/hooks/use-move';
import { GUTTER, INSET, SECTION_GAP } from '@/theme';

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
 * it's the one deleted.
 */
export function AllChats({
  houseId,
  zone,
  now,
  onOpen,
  onDeleted,
}: {
  houseId: string;
  zone: string;
  now: Date;
  onOpen: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const chats = useAskChats(houseId);
  const move = useMove(houseId);
  const toast = useToastIfAny();
  const [doomed, setDoomed] = useState<ChatSummary | null>(null);
  const list = chats.data ?? [];

  async function remove() {
    if (!doomed) return;
    const id = doomed.id;
    if (await move.run(() => deleteChat(id))) {
      setDoomed(null);
      onDeleted(id);
      toast?.show(ASK_CHATS_COPY.deleted);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} testID="all-chats">
      {list.length === 0 ? (
        <Section label={ASK_CHATS_COPY.all}>
          <Row title={ASK_CHATS_COPY.none} titleLines={2} testID="chats-none" />
        </Section>
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
      <Meta style={styles.note}>{ASK_CHATS_COPY.allNote}</Meta>
      <ConfirmSheet
        visible={doomed !== null}
        title={ASK_CHATS_COPY.deleteTitle}
        body={ASK_CHATS_COPY.deleteBody}
        confirmLabel={ASK_CHATS_COPY.delete}
        icon={Trash2Icon}
        busy={move.pending}
        problem={move.problem}
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
