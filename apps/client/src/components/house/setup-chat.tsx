import {
  andNames,
  askExamples,
  dayChoices,
  weekdayName,
  changesMeta,
  thinkingSteps,
  CATEGORIES,
  changedLine,
  CHAT_FULL,
  CHAT_LONG_AT,
  CHAT_MAX_MESSAGES,
  chatCarryOver,
  DEAL_MODES,
  draftChanges,
  groupChanges,
  listAsDraft,
  MESSAGE_MAX,
  membersLine,
  pointsLabel,
  scheduleLine,
  STARTER_KINDS,
  starterDraft,
  weeklyEffort,
  type ChatAsk,
  type ChatMessage,
  type ChatMove,
  type ChatReset,
  type ChatSummed,
  type DealMode,
  type DraftChange,
  type DraftedJohn,
  type GroupDef,
  type HouseDraft,
  type HouseRules,
  type JohnDef,
  type IsoDow,
  type SavedTurn,
  type StarterKind,
  type Words,
} from '@app/core';
import { router } from 'expo-router';
import { CheckIcon, MessagesSquareIcon, MinusIcon, PencilIcon, PlusIcon, SquarePenIcon, TicketIcon } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { keepChat, type SavedChat } from '@/api/ask-chats';
import { applyDraft, sendChat } from '@/api/draft';
import { saveDealMode } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { LowWarning, OutNotice, usageState } from '@/components/chat/ask-usage';
import { ChatLog, Composer, JonzSaid, Said, SummedUp, UserBubble } from '@/components/chat/chat';
import { ChatNotice, ChatStop } from '@/components/chat/chat-notice';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { MovesCard } from '@/components/house/moves-card';
import { ResetsCard } from '@/components/house/resets-card';
import { NO_PIECES, type ReplyPieces } from '@/components/reply/reply';
import { stepsShown, Thinking } from '@/components/house/thinking';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Body, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useAskUsage } from '@/hooks/use-ask-usage';
import { askChatsKey } from '@/hooks/keys';
import { useMove } from '@/hooks/use-move';
import { INSET, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

type Person = { userId: string; name: string };

/**
 * One line of the chat: what the admin said, what Jonz said back (with a
 * question to tap an answer to, the draft when that turn changed it, and
 * any resets it offers an admin), or the Johns being added.
 */
type Turn =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      ask: ChatAsk | null;
      draft: HouseDraft | null;
      resets?: ChatReset[];
      /** Other moves Jonz put on a card (time away). */
      moves?: ChatMove[];
      /** How long Jonz thought, and the steps it showed meanwhile; a starter list has none. */
      thought?: { seconds: number; steps: string[] };
      /** A reply from a chat kept earlier that had a card then: the card isn't kept, so it says to ask again. */
      old?: boolean;
      /** Before this reply Jonz summed up the chat's start (SavedTurn's `summed`). */
      summed?: ChatSummed;
    }
  | { role: 'done'; added: number };

/** A kept chat's turns as the chat shows them: no card comes back, only that there was one. */
function fromSaved(saved: readonly SavedTurn[]): Turn[] {
  return saved.map((t) =>
    t.role === 'assistant' ? { role: 'assistant', text: t.text, ask: t.ask, draft: null, old: t.hadCard, ...(t.summed ? { summed: t.summed } : {}) } : t,
  );
}

/** The chat's turns as they're kept: what was said, and whether a reply had a card. */
function toSaved(turns: readonly Turn[]): SavedTurn[] {
  return turns.map((t) =>
    t.role === 'assistant'
      ? {
          role: 'assistant',
          text: t.text,
          ask: t.ask,
          hadCard: Boolean(t.old || t.draft || t.resets?.length || t.moves?.length),
          ...(t.summed ? { summed: t.summed } : {}),
        }
      : t,
  );
}

/** The chat as messages: what was said and Jonz's replies with words, oldest first. */
function messagesOf(turns: readonly Turn[]): ChatMessage[] {
  return turns.flatMap((t) => (t.role === 'done' || !t.text ? [] : [{ role: t.role, text: t.text }]));
}

/** Jonz's latest summary of the chat's start, if it has one. */
function summedOf(turns: readonly Turn[]): ChatSummed | null {
  for (let at = turns.length - 1; at >= 0; at--) {
    const t = turns[at];
    if (t.role === 'assistant' && t.summed) return t.summed;
  }
  return null;
}

/** The turn the latest summary's line goes over: the first one it doesn't stand for. -1 for none. */
function summedTurn(turns: readonly Turn[], summed: ChatSummed | null): number {
  if (!summed) return -1;
  if (summed.count === 0) return 0;
  let seen = 0;
  for (let at = 0; at < turns.length; at++) {
    const t = turns[at];
    if (t.role === 'done' || !t.text) continue;
    if (seen === summed.count) return at;
    seen++;
  }
  return -1;
}

/**
 * A new chat that carries on from a full one: it opens with the line from
 * the last chat, holding its summary and what was said since.
 */
function carriedChat(turns: readonly Turn[], words: Words): SavedTurn[] {
  const summed = summedOf(turns);
  const since = messagesOf(turns).slice(summed?.count ?? 0);
  const text = chatCarryOver(summed?.text ?? null, since, { you: words('ask.long.you'), jonz: words('ask.long.jonz') });
  return text ? [{ role: 'assistant', text: '', ask: null, hadCard: false, summed: { text, count: 0 } }] : [];
}

/** The chat's turns drawn, with `line` over the one at `at` (none when it's -1). */
function withLine(views: ReactNode[], at: number, line: ReactNode): ReactNode[] {
  return at < 0 || !line ? views : [...views.slice(0, at), line, ...views.slice(at)];
}

/** The time, for how long Jonz thought: read in a send, never while drawing. */
const clock = () => Date.now();

/** How many of a new house's drafted Johns show before "See all". */
const FOLDED = 3;
/** How many changes to a list show before "See all": most asks are a few, and all of them show. */
const CHANGES_FOLDED = 6;

/** The card's sections, in the order it shows them: what goes first, so it's never missed. */
const KINDS = ['remove', 'change', 'add'] as const;


/** Roughly how many points a week Johns come to: one due every few weeks or months counts its share, one on call as often as it comes up. */
function pointsAWeek(johns: readonly DraftedJohn[]): number {
  return Math.round(weeklyEffort(johns));
}

/** The list once the ticked changes are applied (an unticked change leaves its John as it was). */
function afterApplying(base: HouseDraft | null, changes: readonly DraftChange[], keep: readonly string[]): DraftedJohn[] {
  const ticked = (c: DraftChange) => keep.includes(c.key);
  const touched = new Map(changes.flatMap((c) => (c.kind === 'remove' ? [] : [[c.john, c] as const])));
  const list = (base?.johns ?? []).filter((j) => !changes.some((c) => c.kind !== 'add' && c.before.id === j.id && ticked(c)));
  for (const [john, c] of touched) if (ticked(c)) list.push(john);
  return list;
}

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
    if (await keeping.run(async () => (added = await applyDraft(houseId, rules, base, draft, keep, { johns, groups }, new Date())))) {
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

// Smart is the suggested one, as in House rules.
const modes = (words: Words) =>
  DEAL_MODES.map((m) => ({
    mode: m,
    label: words(`week.steady.modeName.${m}` as const),
    meta: m === 'smart' ? `${words('week.steady.suggested')} ${words(`week.steady.modeMeta.${m}` as const)}` : words(`week.steady.modeMeta.${m}` as const),
  }));

/**
 * How the house shares Johns, asked once a new house has its list: Smart
 * (chosen already, as every house starts) or Classic, each saying what it
 * means. A tap saves it; House rules can change it after.
 */
function ModeAsk({ houseId, start }: { houseId: string; start: DealMode }) {
  const words = useWords();
  const move = useMove(houseId);
  const [mode, setMode] = useState(start);

  async function pick(next: DealMode) {
    if (next === mode) return;
    const was = mode;
    setMode(next);
    if (!(await move.run(() => saveDealMode(houseId, next)))) setMode(was);
  }

  return (
    <>
      <Body>{words('week.steady.modeAsk')}</Body>
      <Group testID="chat-mode">
        <View accessibilityRole="radiogroup" accessibilityLabel={words('week.steady.mode')}>
          {modes(words).map((m) => (
            <ChoiceRow
              key={m.mode}
              role="radio"
              label={m.label}
              meta={m.meta}
              metaLines={4}
              checked={m.mode === mode}
              disabled={move.pending}
              onPress={() => void pick(m.mode)}
              testID={`chat-mode-${m.mode}`}
            />
          ))}
        </View>
      </Group>
      {move.problem ? <Alert message={move.problem} /> : null}
      <Meta>{words('common.join.then', { first: words('week.steady.modeFoot'), second: words('week.steady.modeLater') })}</Meta>
    </>
  );
}

/** Jonz's question, answered with a tap: a few quick answers as buttons, or a day as the app's day picker. */
function AskCard({ ask, weekStarts, onAnswer }: { ask: ChatAsk; weekStarts: IsoDow; onAnswer: (answer: string) => void }) {
  const words = useWords();
  if (ask.kind === 'choices') {
    return (
      <View style={styles.choices} testID="ask-choices">
        {ask.options.map((option) => (
          <Button key={option} variant="outline" label={option} onPress={() => onAnswer(option)} testID="ask-choice" />
        ))}
      </View>
    );
  }
  const days = Array.from({ length: 7 }, (_, k) => (((weekStarts - 1 + k) % 7) + 1) as IsoDow);
  return (
    <Segmented<number>
      equal
      label={words('ask.draft.pickDay')}
      value={0}
      options={days.map((d) => dayChoices(words)[d - 1])}
      onChange={(d) => onAnswer(weekdayName(d, words))}
      testID="ask-day"
    />
  );
}

/**
 * The draft, in the chat. For a new house, its first few Johns as the setup
 * checklist shows them, every one ticked, opening into the whole list with
 * its groups; the amber button adds the ticked ones. For a house with a
 * list, the same card holds what the draft would change: Johns to add, to
 * change (saying what was different) and to take off, each ticked, and the
 * button applies the ticked ones.
 */
function DraftCard({
  base,
  draft,
  keep,
  open,
  onOpen,
  onToggle,
  onKeep,
  pending,
  problem,
  people,
  me,
}: {
  base: HouseDraft | null;
  draft: HouseDraft;
  keep: string[];
  open: boolean;
  onOpen: (open: boolean) => void;
  onToggle: (key: string) => void;
  onKeep: () => void;
  pending: boolean;
  problem: string | null;
  people: Person[];
  me: string;
}) {
  const words = useWords();
  const editing = base !== null;
  const changes = draftChanges(base, draft);
  const regrouped = groupChanges(base, draft);
  // A list's changes sorted by kind (taking off, changing, adding); a new house's Johns, opened, in the list's own order.
  const ordered = editing
    ? KINDS.flatMap((kind) => changes.filter((c) => c.kind === kind))
    : CATEGORIES.flatMap((cat) => changes.filter((c) => c.kind !== 'remove' && c.john.category === cat));
  const folded = editing ? CHANGES_FOLDED : FOLDED;
  const shown = open ? ordered : (editing ? ordered : changes).slice(0, folded);
  const groups = draft.groups.filter((g) => changes.some((c) => c.kind !== 'remove' && c.john.group === g.name));
  const waiting = groups.filter((g) => g.memberIds.length === 0);
  const after = afterApplying(base, changes, keep);
  const line = (j: DraftedJohn) => [scheduleLine({ ...j, dueDow: j.dueDow as IsoDow }, words, j.group), pointsLabel(j.points, words)].join(', ');
  const row = (c: DraftChange) => {
    const j = c.kind === 'remove' ? c.before : c.john;
    const meta = c.kind === 'change' ? changedLine(c.before, c.john, words) : [line(j), editing ? null : j.why || null].filter(Boolean).join(', ');
    return (
      <ChoiceRow
        key={c.key}
        role="checkbox"
        label={j.name}
        meta={meta}
        leading={editing ? <KindIcon kind={c.kind} /> : undefined}
        checked={keep.includes(c.key)}
        onPress={() => onToggle(c.key)}
        disabled={pending}
        metaLines={2}
        testID={`draft-${c.kind === 'add' ? 'john' : c.kind}`}
      />
    );
  };
  return (
    <View style={styles.card} testID="draft-card">
      {editing ? (
        <>
          <Meta style={styles.inset} testID="draft-points">
            {changesMeta(words, pointsAWeek(base.johns), pointsAWeek(after))}
          </Meta>
          {KINDS.map((kind) => {
            const these = shown.filter((c) => c.kind === kind);
            // Groups the house has, with new people in them, go under Changing after the Johns.
            const moved = kind === 'change' ? regrouped : [];
            const all = changes.filter((c) => c.kind === kind).length + moved.length;
            return these.length + moved.length > 0 ? (
              <Section key={kind} label={words(KIND_HEADING[kind])} count={all} testID={`draft-${kind}s`}>
                {these.map(row)}
                {moved.map((g) => (
                  <ChoiceRow
                    key={g.key}
                    role="checkbox"
                    label={g.before.name}
                    meta={words('ask.draft.groupPeople', { before: membersLine(g.before.memberIds, people, me, words), after: membersLine(g.group.memberIds, people, me, words) })}
                    leading={<KindIcon kind="change" />}
                    checked={keep.includes(g.key)}
                    onPress={() => onToggle(g.key)}
                    disabled={pending}
                    metaLines={2}
                    testID="draft-group-change"
                  />
                ))}
              </Section>
            ) : null;
          })}
        </>
      ) : (
        <Section label={words('ask.draft.draftLabel')} right={words('ask.draft.draftMeta', { n: keep.length, points: pointsAWeek(after) })}>
          {shown.map(row)}
        </Section>
      )}
      {changes.length > folded ? (
        <TextButton
          label={open ? words('ask.draft.showLess') : words('ask.draft.seeAll', { n: changes.length })}
          onPress={() => onOpen(!open)}
          testID="draft-see-all"
        />
      ) : null}
      {open && groups.length > 0 ? (
        <Section label={words('ask.draft.groupsLabel')} testID="draft-groups">
          {groups.map((g) => (
            <Row
              key={g.name}
              title={g.name}
              meta={[
                g.memberIds.length > 0 ? membersLine(g.memberIds, people, me, words) : null,
                g.waitingFor.length > 0 ? words('ask.draft.waiting', { names: andNames(g.waitingFor, words) }) : null,
              ]
                .filter(Boolean)
                .join(', ')}
              testID="draft-group"
            />
          ))}
        </Section>
      ) : null}
      {open && waiting.length > 0 ? (
        <Meta style={styles.inset}>{words('ask.draft.everyoneForNow', { groups: andNames(waiting.map((g) => g.name), words) })}</Meta>
      ) : null}
      {draft.note ? (
        <Meta style={styles.inset} testID="draft-note">
          {draft.note}
        </Meta>
      ) : null}
      {problem ? <Alert message={problem} /> : null}
      <ButtonRow>
        <Button
          label={editing ? words('ask.draft.apply', { n: keep.length }) : words('ask.draft.keep', { n: keep.length })}
          busyLabel={editing ? words('ask.draft.applying') : words('ask.draft.keeping')}
          onPress={onKeep}
          busy={pending}
          disabled={keep.length === 0}
          testID="describe-keep"
        />
      </ButtonRow>
    </View>
  );
}

const KIND_HEADING = {
  remove: 'ask.draft.removingHeading',
  change: 'ask.draft.changingHeading',
  add: 'ask.draft.addingHeading',
} as const;

/** What a change does, at the row's leading edge: a minus in the hazard colour to take off, a pencil to change, a plus to add. */
function KindIcon({ kind }: { kind: DraftChange['kind'] }) {
  const { colors } = useTheme();
  const Icon = kind === 'add' ? PlusIcon : kind === 'change' ? PencilIcon : MinusIcon;
  return <Icon size={20} color={kind === 'remove' ? colors.hazard : colors.foreground} aria-hidden />;
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  card: { gap: SPACE.md },
  inset: { paddingHorizontal: INSET },
});
