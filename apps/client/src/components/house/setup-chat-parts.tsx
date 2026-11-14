import { askExamples, CHAT_FULL, MESSAGE_MAX, STARTER_KINDS, type ChatSummed, type Currency, type DealMode, type StarterKind, type Words } from '@app/core';
import { CheckIcon, MessagesSquareIcon, SquarePenIcon, TicketIcon } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { LowWarning, OutNotice } from '@/components/chat/ask-usage';
import { Composer, JonzSaid, Said, SummedUp } from '@/components/chat/chat';
import { ChatNotice, ChatStop } from '@/components/chat/chat-notice';
import { Group } from '@/components/group';
import { MovesCard } from '@/components/house/moves-card';
import { ResetsCard } from '@/components/house/resets-card';
import { type ReplyPieces } from '@/components/reply/reply';
import { Row, RowIcon } from '@/components/row';
import { Body, Meta } from '@/components/text';
import { type useAskUsage } from '@/hooks/use-ask-usage';
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';
import { ModeAsk } from './setup-chat-cards';
import { type Turn } from './setup-chat-turns';

// The setup chat's parts: its greeting, its foot, and the turns that aren't the admin's own.

type Usage = NonNullable<ReturnType<typeof useAskUsage>['data']>;

/**
 * Under the chat. Every warning the chat's one way (chat-notice.tsx): a card
 * in the box's place when nothing more can be sent (`stop`: the House Pass
 * is needed, the week's allowance is out, or the chat is full), else at most
 * one line over the box, the most urgent (`warn`).
 */
export function ChatFoot({
  stop,
  warn,
  usage,
  zone,
  onCarryOn,
  box,
}: {
  stop: 'pass' | 'out' | 'full' | null;
  warn: 'low' | 'long' | null;
  usage: Usage | undefined;
  zone: string;
  onCarryOn: () => void;
  box: { value: string; onChangeText: (text: string) => void; onSend: () => void; busy: boolean; placeholder: string; problem: string | null };
}) {
  const words = useWords();
  if (stop === 'pass') {
    return (
      <ChatStop title={words('ask.draft.passNeeded')} note={words('ask.draft.passNeededNote')} testID="chat-pass">
        <Button label={words('ask.draft.seePass')} icon={TicketIcon} href="/house/pass" testID="chat-see-pass" />
      </ChatStop>
    );
  }
  if (stop === 'out' && usage) return <OutNotice usage={usage} zone={zone} />;
  if (stop === 'full') {
    return (
      <ChatStop title={words('ask.long.full')} note={words('ask.long.fullNote')} testID="chat-full">
        <Button label={words('ask.long.carryOn')} icon={SquarePenIcon} onPress={onCarryOn} testID="chat-carry-on" />
      </ChatStop>
    );
  }
  return (
    <>
      {warn === 'low' && usage ? (
        <LowWarning usage={usage} zone={zone} />
      ) : warn === 'long' ? (
        <ChatNotice icon={MessagesSquareIcon} text={words('ask.long.nearlyFull', { max: CHAT_FULL })} label={words('ask.long.carryOn')} onPress={onCarryOn} testID="chat-long" />
      ) : null}
      <Composer {...box} label={words('ask.draft.message')} sendLabel={words('ask.draft.send')} maxLength={MESSAGE_MAX} />
    </>
  );
}

/**
 * What Jonz opens with. Before anything is said (`fresh`) a chat never opens
 * on nothing: a house with a list (`editing`), or someone who can't change
 * it, gets three questions to tap (unless nothing can be asked: `closed`); a
 * new house gets the starter lists.
 */
export function Greeting({
  canChange,
  editing,
  fresh,
  closed,
  onAsk,
  onPick,
}: {
  canChange: boolean;
  editing: boolean;
  fresh: boolean;
  closed: boolean;
  onAsk: (question: string) => void;
  onPick: (kind: StarterKind) => void;
}) {
  const words = useWords();
  return (
    <Said testID="chat-greeting">
      <Body>{!canChange ? words('ask.draft.greetingAsk') : editing ? words('ask.draft.greetingList') : words('ask.draft.greeting')}</Body>
      {(editing || !canChange) && fresh ? (
        <>
          {closed ? null : (
            <>
              <Meta>{words('ask.draft.orAsk')}</Meta>
              <View style={styles.choices} testID="chat-examples">
                {askExamples(words).map((question, at) => (
                  <Button key={question} variant="outline" label={question} onPress={() => onAsk(question)} testID={`chat-example-${at}`} />
                ))}
              </View>
            </>
          )}
          <Meta>{words('ask.draft.privacy')}</Meta>
        </>
      ) : null}
      {!editing && canChange && fresh ? (
        <>
          <Meta>{words('ask.draft.orStart')}</Meta>
          <View style={styles.choices}>
            {STARTER_KINDS.map((kind) => (
              <Button
                key={kind}
                variant="outline"
                label={words(`ask.draft.starter.${kind}.title` as const)}
                spoken={`${words(`ask.draft.starter.${kind}.title` as const)}: ${words(`ask.draft.starter.${kind}.meta` as const)}`}
                onPress={() => onPick(kind)}
                testID={`starter-${kind}`}
              />
            ))}
          </View>
          <Meta>{words('ask.draft.privacy')}</Meta>
        </>
      ) : null}
    </Said>
  );
}

/**
 * The Johns went in: how many, on the way to the list. `askMode` (a new
 * house) follows it with the house's one question about the deal, asked
 * once its first list is in.
 */
export function DoneTurn({
  added,
  editing,
  onOpenList,
  askMode,
}: {
  added: number;
  editing: boolean;
  onOpenList: () => void;
  askMode: { houseId: string; start: DealMode } | null;
}) {
  const words = useWords();
  const title = editing ? words('ask.draft.applied', { n: added }) : words('ask.draft.added', { n: added });
  const row = (
    <Group testID="chat-done">
      <Row
        title={title}
        meta={editing ? words('ask.draft.appliedMeta') : words('ask.draft.addedMeta')}
        leading={<RowIcon icon={CheckIcon} />}
        onPress={onOpenList}
        accessibilityLabel={`${title}. ${words('ask.draft.openList')}`}
        chevron
        testID="chat-open-list"
      />
    </Group>
  );
  if (!askMode) return <View>{row}</View>;
  return (
    <Said>
      {row}
      <ModeAsk houseId={askMode.houseId} start={askMode.start} />
    </Said>
  );
}

/**
 * What Jonz said, with what it offers under it. `children` are the
 * question's answers and the draft's card, over any resets and moves.
 */
export function JonzTurn({
  turn,
  pieces,
  house,
  children,
}: {
  turn: Turn & { role: 'assistant' };
  pieces: ReplyPieces;
  house: { id: string; me: string; nameOf: (id: string) => string; currency: Currency; zone: string };
  children: ReactNode;
}) {
  const words = useWords();
  return (
    <JonzSaid text={turn.text} thought={turn.thought} pieces={pieces}>
      {turn.old ? <Meta testID="chat-old-card">{words('ask.chats.oldCard')}</Meta> : null}
      {children}
      {turn.resets && turn.resets.length > 0 ? (
        <ResetsCard houseId={house.id} items={turn.resets} me={house.me} nameOf={house.nameOf} currency={house.currency} zone={house.zone} />
      ) : null}
      {turn.moves && turn.moves.length > 0 ? <MovesCard houseId={house.id} me={house.me} items={turn.moves} /> : null}
    </JonzSaid>
  );
}

/** The line where Jonz summed up the chat's start, or carried it over from a full one. */
export function SummedLine({ summed }: { summed: ChatSummed }) {
  const words = useWords();
  return <SummedUp label={summed.count === 0 ? words('ask.long.carried') : words('ask.long.summed', { n: summed.count })} summary={summed.text} />;
}

/** What the empty box says: what there is to ask for here. */
export function placeholderFor(chat: { canChange: boolean; editing: boolean; fresh: boolean; drafting: boolean }, words: Words): string {
  if (!chat.canChange) return words('ask.draft.placeholderAsk');
  if (chat.editing && chat.fresh) return words('ask.draft.placeholderList');
  return chat.drafting ? words('ask.draft.placeholderChange') : words('ask.draft.placeholder');
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
