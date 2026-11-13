import {
  askExamples,
  thinkingSteps,
  CHAT_FULL,
  CHAT_LONG_AT,
  CHAT_MAX_MESSAGES,
  draftChanges,
  groupChanges,
  listAsDraft,
  MESSAGE_MAX,
  STARTER_KINDS,
  starterDraft,
  type GroupDef,
  type HouseDraft,
  type HouseRules,
  type JohnDef,
  type SavedTurn,
  type StarterKind,
} from '@app/core';
import { router } from 'expo-router';
import { CheckIcon, MessagesSquareIcon, SquarePenIcon, TicketIcon } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { keepChat, type SavedChat } from '@/api/ask-chats';
import { applyDraft, sendChat } from '@/api/draft';
import { Button } from '@/components/button';
import { LowWarning, OutNotice, usageState } from '@/components/chat/ask-usage';
import { ChatLog, Composer, JonzSaid, Said, SummedUp, UserBubble } from '@/components/chat/chat';
import { ChatNotice, ChatStop } from '@/components/chat/chat-notice';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { MovesCard } from '@/components/house/moves-card';
import { ResetsCard } from '@/components/house/resets-card';
import { NO_PIECES, type ReplyPieces } from '@/components/reply/reply';
import { stepsShown, Thinking } from '@/components/house/thinking';
import { Body, Meta } from '@/components/text';
import { useAskUsage } from '@/hooks/use-ask-usage';
import { askChatsKey } from '@/hooks/keys';
import { useMove } from '@/hooks/use-move';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';
import { AskCard, DraftCard, ModeAsk } from './setup-chat-cards';
import { carriedChat, clock, fromSaved, messagesOf, Person, summedOf, summedTurn, toSaved, Turn, withLine } from './setup-chat-turns';

/**
 * Describe your house, as a chat: Jonz asks, the admin answers in words or
 * by tapping a quick answer or a day, and the draft list shows in the chat
 * as a card, every John ticked. Each message after that changes the draft
 * ("oven every month"); the card opens into the whole list, and the amber
 * button adds the ticked Johns (making any groups they need). Nothing is
 * written before that. The cards are the app's own rows, buttons and day
 * picker, so the draft looks as the list will.
 */
export function SetupChat({
  houseId,
  rules,
  johns,
  groups,
  people,
  me,
  passOpen,
  canChange = true,
  onOpenList = () => router.dismissTo('/house/johns'),
  pieces = NO_PIECES,
  saved = null,
  seed,
  onKept,
  onTalked,
  onCarryOn,
}: {
  houseId: string;
  rules: HouseRules;
  /** The house's list as it stands: empty for a new house, which the chat sets up; otherwise the chat changes it. */
  johns: JohnDef[];
  /** The house's groups already, so a drafted group with the same name is used as it is. */
  groups: GroupDef[];
  people: Person[];
  me: string;
  /** Whether the House Pass's extras are open to this house: changing a list with Jonz is one. */
  passOpen: boolean;
  /** Whether this person may change the list (an admin, a parent). Without it, Jonz answers questions and drafts nothing. */
  canChange?: boolean;
  /** The done row's way to the John list: back down the stack on a page, across to it from the side panel. */
  onOpenList?: () => void;
  /** What Jonz's replies' chips and cards stand for (components/reply/pieces.tsx); without it they're words. */
  pieces?: ReplyPieces;
  /** A chat kept earlier, to carry on with; none starts a new one. Remount (a new key) to switch. */
  saved?: SavedChat | null;
  /** A new chat's first turns: the line from a full chat it carries on from (carriedChat). */
  seed?: readonly SavedTurn[];
  /** The chat is kept, under this id: after each answer, so it's never lost. */
  onKept?: (id: string) => void;
  /** Whether there's anything in the chat yet (said, or being written): New chat has nothing to clear until there is. */
  onTalked?: (talked: boolean) => void;
  /** Carry on in a new chat, opening with these turns (a long chat's summary): a full chat's way on. */
  onCarryOn?: (seed: SavedTurn[]) => void;
}) {
  const words = useWords();
  const keeping = useMove(houseId);
  // The list as the chat found it: what a draft's changes are counted from. Held while a draft is open, so
  // applying doesn't move it under the card; once a draft is applied, it's the list as it now is.
  const live = useMemo(() => (johns.length > 0 ? listAsDraft(johns, groups) : null), [johns, groups]);
  const [held, setHeld] = useState(live);
  const [rebase, setRebase] = useState(false);
  const base = rebase ? live : held;
  const editing = base !== null;
  const [turns, setTurns] = useState<Turn[]>(() => fromSaved(saved?.turns ?? seed ?? []));
  const chatId = useRef(saved?.id ?? null);
  // Keeping goes one at a time, so the first answer's new row is the one the next answer updates.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const unkept = useRef(false);
  // Only a chat with something written in it is kept: a starter list tapped and kept is no chat to come back to.
  const written = useRef((saved?.turns.length ?? 0) > 0);
  const client = useQueryClient();
  const [draft, setDraft] = useState<HouseDraft | null>(base);
  const [keep, setKeep] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const usage = useAskUsage(houseId);
  const week = usageState(usage.data);
  // A long chat: from CHAT_LONG_AT turns it says so; at CHAT_FULL it carries on in a new one.
  const full = turns.length >= CHAT_FULL;
  const long = turns.length >= CHAT_LONG_AT;
  const summed = summedOf(turns);
  const summedAt = summedTurn(turns, summed);
  const carryOn = () => onCarryOn?.(carriedChat(turns, words));

  // A new house's chat ends once its first list is in (the deal question follows); a list's chat carries on.
  const done = !editing && turns.some((t) => t.role === 'done');
  const busy = sending || keeping.pending;
  const talked = turns.length > 0 || text.trim() !== '';
  useEffect(() => onTalked?.(talked), [talked, onTalked]);
  // The draft card sits under the turn that last changed the draft; only Jonz's last question can be answered.
  const draftAt = turns.findLastIndex((t) => t.role === 'assistant' && t.draft !== null);
  const last = turns.at(-1);
  const ask = !busy && last?.role === 'assistant' ? last.ask : null;
  // What Jonz shows itself doing while it answers: "your list" once there's a draft or a list to look at.
  const steps = thinkingSteps(draft !== null, words);

  // Each answer (and each list applied) keeps the chat as it now is. A chat that can't be kept carries on
  // regardless: keeping is for coming back to it, never in the way of it.
  useEffect(() => {
    if (!unkept.current || !written.current || turns.length === 0) return;
    unkept.current = false;
    const kept = toSaved(turns);
    queue.current = queue.current.then(async () => {
      try {
        chatId.current = await keepChat(houseId, chatId.current, kept);
        onKept?.(chatId.current);
        await client.invalidateQueries({ queryKey: askChatsKey(houseId) });
      } catch {
        // Not kept this time; the next answer tries again with the whole chat.
        unkept.current = true;
      }
    });
  }, [turns, houseId, client, onKept]);

  function answered(reply: Turn & { role: 'assistant' }, said: Turn[]) {
    unkept.current = true;
    setTurns([...said, reply]);
    if (reply.draft) {
      // A new draft holds the list it was made from until it's applied.
      if (rebase) {
        setHeld(live);
        setRebase(false);
      }
      setDraft(reply.draft);
      setKeep([...draftChanges(base, reply.draft), ...groupChanges(base, reply.draft)].map((c) => c.key));
    }
  }

  async function send(text: string) {
    const said = text.trim();
    if (!said || busy || done) return;
    const before = turns;
    const next: Turn[] = [...turns, { role: 'user', text: said }];
    written.current = true;
    setTurns(next);
    setText('');
    setProblem(null);
    setSending(true);
    const asked = clock();
    try {
      // Jonz reads its summary of the chat's start, then everything since (CHAT_MAX_MESSAGES at most).
      const all = messagesOf(next);
      const earlier = summedOf(next);
      const from = Math.max(earlier?.count ?? 0, all.length - CHAT_MAX_MESSAGES);
      const answer = await sendChat(houseId, all.slice(from), draft, words, earlier?.text ?? null);
      const took = clock() - asked;
      const thought = { seconds: Math.max(1, Math.round(took / 1000)), steps: stepsShown(steps, took) };
      if (answer.allowance) usage.put(answer.allowance);
      // Jonz summed up the start this turn: the summary now stands for the messages before `from` too.
      const newly = answer.summed ? { summed: { text: answer.summed.text, count: from + answer.summed.count } } : {};
      answered({ role: 'assistant', text: answer.reply, ask: answer.ask, draft: answer.draft, resets: answer.resets, moves: answer.moves, thought, ...newly }, next);
    } catch (reason) {
      // Refused (too many today, say): what was said goes back in the box to try again.
      setTurns(before);
      setText(said);
      setProblem(reason instanceof Error ? reason.message : String(reason));
      // Used up while they wrote: the box gives way to the notice.
      void usage.refetch();
    } finally {
      setSending(false);
    }
  }

  function pick(kind: StarterKind) {
    const said: Turn[] = [...turns, { role: 'user', text: words(`ask.draft.starter.${kind}.title` as const) }];
    answered({ role: 'assistant', text: words('ask.draft.fromStarter'), ask: null, draft: starterDraft(kind) }, said);
  }

  async function add() {
    if (!draft) return;
    let added = 0;
    if (await keeping.run(async () => (added = await applyDraft({ houseId, rules, list: { johns, groups }, now: new Date() }, { base, draft, keys: keep })))) {
      unkept.current = true;
      setTurns((was) => [...was, { role: 'done', added }]);
      // A list's chat carries on from the list as it now is, read again from the house. A new house's
      // chat ends here (the deal question follows), so it keeps the base it had.
      setDraft(null);
      if (editing) setRebase(true);
    }
  }

  const toggle = (key: string) => setKeep((was) => (was.includes(key) ? was.filter((k) => k !== key) : [...was, key]));
  const gated = editing && !passOpen;
  const nameOf = (id: string) => (id === me ? 'You' : (people.find((p) => p.userId === id)?.name ?? 'Someone'));

  const placeholder = !canChange
    ? words('ask.draft.placeholderAsk')
    : editing && turns.length === 0
      ? words('ask.draft.placeholderList')
      : draft
        ? words('ask.draft.placeholderChange')
        : words('ask.draft.placeholder');

  return (
    <ChatLog
      foot={
        // Every warning the chat's one way (chat-notice.tsx): a card in the box's place when nothing more can be
        // sent, else at most one line over the box, the most urgent.
        done ? null : gated ? (
          <ChatStop title={words('ask.draft.passNeeded')} note={words('ask.draft.passNeededNote')} testID="chat-pass">
            <Button label={words('ask.draft.seePass')} icon={TicketIcon} href="/house/pass" testID="chat-see-pass" />
          </ChatStop>
        ) : week === 'out' && usage.data ? (
          <OutNotice usage={usage.data} zone={rules.timezone} />
        ) : full ? (
          <ChatStop title={words('ask.long.full')} note={words('ask.long.fullNote')} testID="chat-full">
            <Button label={words('ask.long.carryOn')} icon={SquarePenIcon} onPress={carryOn} testID="chat-carry-on" />
          </ChatStop>
        ) : (
          <>
            {week === 'low' && usage.data ? (
              <LowWarning usage={usage.data} zone={rules.timezone} />
            ) : long ? (
              <ChatNotice
                icon={MessagesSquareIcon}
                text={words('ask.long.nearlyFull', { max: CHAT_FULL })}
                label={words('ask.long.carryOn')}
                onPress={carryOn}
                testID="chat-long"
              />
            ) : null}
            <Composer
              value={text}
              onChangeText={setText}
              onSend={() => void send(text)}
              busy={busy}
              placeholder={placeholder}
              label={words('ask.draft.message')}
              sendLabel={words('ask.draft.send')}
              maxLength={MESSAGE_MAX}
              problem={problem}
            />
          </>
        )
      }
    >
      <Said testID="chat-greeting">
        <Body>{!canChange ? words('ask.draft.greetingAsk') : editing ? words('ask.draft.greetingList') : words('ask.draft.greeting')}</Body>
        {(editing || !canChange) && turns.length === 0 ? (
          <>
            {/* A chat never opens on nothing: three questions to tap, while it can be asked anything. */}
            {!gated && week !== 'out' ? (
              <>
                <Meta>{words('ask.draft.orAsk')}</Meta>
                <View style={styles.choices} testID="chat-examples">
                  {askExamples(words).map((question, at) => (
                    <Button key={question} variant="outline" label={question} onPress={() => void send(question)} testID={`chat-example-${at}`} />
                  ))}
                </View>
              </>
            ) : null}
            <Meta>{words('ask.draft.privacy')}</Meta>
          </>
        ) : null}
        {!editing && canChange && turns.length === 0 ? (
          <>
            <Meta>{words('ask.draft.orStart')}</Meta>
            <View style={styles.choices}>
              {STARTER_KINDS.map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  label={words(`ask.draft.starter.${kind}.title` as const)}
                  spoken={`${words(`ask.draft.starter.${kind}.title` as const)}: ${words(`ask.draft.starter.${kind}.meta` as const)}`}
                  onPress={() => pick(kind)}
                  testID={`starter-${kind}`}
                />
              ))}
            </View>
            <Meta>{words('ask.draft.privacy')}</Meta>
          </>
        ) : null}
      </Said>

      {/* The line where Jonz summed up the chat goes over the first turn it doesn't stand for. */}
      {withLine(
        turns.map((turn, at) => {
        if (turn.role === 'user') {
          return <UserBubble key={at} text={turn.text} />;
        }
        if (turn.role === 'done') {
          const row = (
            <Group testID="chat-done">
              <Row
                title={editing ? words('ask.draft.applied', { n: turn.added }) : words('ask.draft.added', { n: turn.added })}
                meta={editing ? words('ask.draft.appliedMeta') : words('ask.draft.addedMeta')}
                leading={<RowIcon icon={CheckIcon} />}
                onPress={onOpenList}
                accessibilityLabel={`${editing ? words('ask.draft.applied', { n: turn.added }) : words('ask.draft.added', { n: turn.added })}. ${words('ask.draft.openList')}`}
                chevron
                testID="chat-open-list"
              />
            </Group>
          );
          // A new house's one question about the deal, asked once its first list is in.
          return editing ? (
            <View key={at}>{row}</View>
          ) : (
            <Said key={at}>
              {row}
              <ModeAsk houseId={houseId} start={rules.dealMode} />
            </Said>
          );
        }
        return (
          <JonzSaid key={at} text={turn.text} thought={turn.thought} pieces={pieces}>
            {turn.old ? <Meta testID="chat-old-card">{words('ask.chats.oldCard')}</Meta> : null}
            {/* The question's answers sit under the question, over the draft it's about. */}
            {turn === last && ask ? <AskCard ask={ask} weekStarts={rules.weekStarts} onAnswer={(a) => void send(a)} /> : null}
            {/* A turn that changes nothing on a house's list (a question, say) has no card. */}
            {at === draftAt && draft && (!editing || draftChanges(base, draft).length + groupChanges(base, draft).length > 0) ? (
              <DraftCard
                base={base}
                draft={draft}
                keep={keep}
                open={open}
                onOpen={setOpen}
                onToggle={toggle}
                onKeep={() => void add()}
                pending={keeping.pending}
                problem={keeping.problem}
                people={people}
                me={me}
              />
            ) : null}
            {turn.resets && turn.resets.length > 0 ? (
              <ResetsCard houseId={houseId} items={turn.resets} me={me} nameOf={nameOf} currency={rules.currency} zone={rules.timezone} />
            ) : null}
            {turn.moves && turn.moves.length > 0 ? <MovesCard houseId={houseId} me={me} items={turn.moves} /> : null}
          </JonzSaid>
        );
      }),
        summedAt,
        summed ? (
          <SummedUp
            key="summed"
            label={summed.count === 0 ? words('ask.long.carried') : words('ask.long.summed', { n: summed.count })}
            summary={summed.text}
          />
        ) : null,
      )}

      {sending ? <Thinking steps={steps} /> : null}
    </ChatLog>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
