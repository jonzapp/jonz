import {
  CATEGORIES,
  changedLine,
  CHAT_MAX_MESSAGES,
  DEAL_MODES,
  draftChanges,
  DOW_LABEL,
  HOUSE_DRAFT_COPY,
  listAsDraft,
  MESSAGE_MAX,
  membersLine,
  pointsLabel,
  scheduleLine,
  STARTER_KINDS,
  starterDraft,
  STEADY_COPY,
  weeklyEffort,
  type ChatAsk,
  type ChatMessage,
  type ChatReset,
  type DealMode,
  type DraftChange,
  type DraftedJohn,
  type GroupDef,
  type HouseDraft,
  type HouseRules,
  type JohnDef,
  type IsoDow,
  type StarterKind,
} from '@app/core';
import { router } from 'expo-router';
import { CheckIcon, MinusIcon, PencilIcon, PlusIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { applyDraft, sendChat } from '@/api/draft';
import { saveDealMode } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ChatLog, Composer, ComposerBar, JonzSaid, Said, UserBubble } from '@/components/chat/chat';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { ResetsCard } from '@/components/house/resets-card';
import { NO_PIECES, type ReplyPieces } from '@/components/reply/reply';
import { stepsShown, Thinking } from '@/components/house/thinking';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Body, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useMove } from '@/hooks/use-move';
import { INSET, SPACE, useTheme } from '@/theme';

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
      /** How long Jonz thought, and the steps it showed meanwhile; a starter list has none. */
      thought?: { seconds: number; steps: string[] };
    }
  | { role: 'done'; added: number };

/** How many of a new house's drafted Johns show before "See all". */
const FOLDED = 3;
/** How many changes to a list show before "See all": most asks are a few, and all of them show. */
const CHANGES_FOLDED = 6;

/** The card's sections, in the order it shows them: what goes first, so it's never missed. */
const KINDS = ['remove', 'change', 'add'] as const;

/** "Sam", "Sam and Priya", "Sam, Priya and Tom". */
function namesList(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

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
}) {
  const keeping = useMove(houseId);
  // The list as the chat found it: what a draft's changes are counted from. Held while a draft is open, so
  // applying doesn't move it under the card; once a draft is applied, it's the list as it now is.
  const live = useMemo(() => (johns.length > 0 ? listAsDraft(johns, groups) : null), [johns, groups]);
  const [held, setHeld] = useState(live);
  const [rebase, setRebase] = useState(false);
  const base = rebase ? live : held;
  const editing = base !== null;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState<HouseDraft | null>(base);
  const [keep, setKeep] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A new house's chat ends once its first list is in (the deal question follows); a list's chat carries on.
  const done = !editing && turns.some((t) => t.role === 'done');
  const busy = sending || keeping.pending;
  // The draft card sits under the turn that last changed the draft; only Jonz's last question can be answered.
  const draftAt = turns.findLastIndex((t) => t.role === 'assistant' && t.draft !== null);
  const last = turns.at(-1);
  const ask = !busy && last?.role === 'assistant' ? last.ask : null;
  // What Jonz shows itself doing while it answers: "your list" once there's a draft or a list to look at.
  const steps = HOUSE_DRAFT_COPY.thinkingSteps(draft !== null);

  function answered(reply: Turn & { role: 'assistant' }, said: Turn[]) {
    setTurns([...said, reply]);
    if (reply.draft) {
      // A new draft holds the list it was made from until it's applied.
      if (rebase) {
        setHeld(live);
        setRebase(false);
      }
      setDraft(reply.draft);
      setKeep(draftChanges(base, reply.draft).map((c) => c.key));
    }
  }

  async function send(words: string) {
    const said = words.trim();
    if (!said || busy || done) return;
    const before = turns;
    const next: Turn[] = [...turns, { role: 'user', text: said }];
    setTurns(next);
    setText('');
    setProblem(null);
    setSending(true);
    const asked = Date.now();
    try {
      const messages: ChatMessage[] = next
        .flatMap((t) => (t.role === 'done' || !t.text ? [] : [{ role: t.role, text: t.text }]))
        .slice(-CHAT_MAX_MESSAGES);
      const answer = await sendChat(houseId, messages, draft);
      const took = Date.now() - asked;
      const thought = { seconds: Math.max(1, Math.round(took / 1000)), steps: stepsShown(steps, took) };
      answered({ role: 'assistant', text: answer.reply, ask: answer.ask, draft: answer.draft, resets: answer.resets, thought }, next);
    } catch (reason) {
      // Refused (too many today, say): what was said goes back in the box to try again.
      setTurns(before);
      setText(said);
      setProblem(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSending(false);
    }
  }

  function pick(kind: StarterKind) {
    const said: Turn[] = [...turns, { role: 'user', text: HOUSE_DRAFT_COPY.starter[kind].title }];
    answered({ role: 'assistant', text: HOUSE_DRAFT_COPY.fromStarter, ask: null, draft: starterDraft(kind) }, said);
  }

  async function add() {
    if (!draft) return;
    let added = 0;
    if (await keeping.run(async () => (added = await applyDraft(houseId, rules, base, draft, keep, { johns, groups }, new Date())))) {
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
    ? HOUSE_DRAFT_COPY.placeholderAsk
    : editing && turns.length === 0
      ? HOUSE_DRAFT_COPY.placeholderList
      : draft
        ? HOUSE_DRAFT_COPY.placeholderChange
        : HOUSE_DRAFT_COPY.placeholder;

  return (
    <ChatLog
      foot={
        done ? null : gated ? (
          <ComposerBar testID="chat-pass">
            <Meta>{HOUSE_DRAFT_COPY.passNeeded}</Meta>
            <Button variant="outline" label={HOUSE_DRAFT_COPY.seePass} href="/house/pass" testID="chat-see-pass" />
          </ComposerBar>
        ) : (
          <Composer
            value={text}
            onChangeText={setText}
            onSend={() => void send(text)}
            busy={busy}
            placeholder={placeholder}
            label={HOUSE_DRAFT_COPY.message}
            sendLabel={HOUSE_DRAFT_COPY.send}
            maxLength={MESSAGE_MAX}
            problem={problem}
          />
        )
      }
    >
      <Said testID="chat-greeting">
        <Body>{!canChange ? HOUSE_DRAFT_COPY.greetingAsk : editing ? HOUSE_DRAFT_COPY.greetingList : HOUSE_DRAFT_COPY.greeting}</Body>
        {(editing || !canChange) && turns.length === 0 ? <Meta>{HOUSE_DRAFT_COPY.privacy}</Meta> : null}
        {!editing && canChange && turns.length === 0 ? (
          <>
            <Meta>{HOUSE_DRAFT_COPY.orStart}</Meta>
            <View style={styles.choices}>
              {STARTER_KINDS.map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  label={HOUSE_DRAFT_COPY.starter[kind].title}
                  spoken={`${HOUSE_DRAFT_COPY.starter[kind].title}: ${HOUSE_DRAFT_COPY.starter[kind].meta}`}
                  onPress={() => pick(kind)}
                  testID={`starter-${kind}`}
                />
              ))}
            </View>
            <Meta>{HOUSE_DRAFT_COPY.privacy}</Meta>
          </>
        ) : null}
      </Said>

      {turns.map((turn, at) => {
        if (turn.role === 'user') {
          return <UserBubble key={at} text={turn.text} />;
        }
        if (turn.role === 'done') {
          const row = (
            <Group testID="chat-done">
              <Row
                title={editing ? HOUSE_DRAFT_COPY.applied(turn.added) : HOUSE_DRAFT_COPY.added(turn.added)}
                meta={editing ? HOUSE_DRAFT_COPY.appliedMeta : HOUSE_DRAFT_COPY.addedMeta}
                leading={<RowIcon icon={CheckIcon} />}
                onPress={onOpenList}
                accessibilityLabel={`${editing ? HOUSE_DRAFT_COPY.applied(turn.added) : HOUSE_DRAFT_COPY.added(turn.added)}. ${HOUSE_DRAFT_COPY.openList}`}
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
            {/* The question's answers sit under the question, over the draft it's about. */}
            {turn === last && ask ? <AskCard ask={ask} weekStarts={rules.weekStarts} onAnswer={(a) => void send(a)} /> : null}
            {/* A turn that changes nothing on a house's list (a question, say) has no card. */}
            {at === draftAt && draft && (!editing || draftChanges(base, draft).length > 0) ? (
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
          </JonzSaid>
        );
      })}

      {sending ? <Thinking steps={steps} /> : null}
    </ChatLog>
  );
}

// Smart is the suggested one, as in House rules.
const MODES = DEAL_MODES.map((m) => ({
  mode: m,
  label: STEADY_COPY.modeName[m],
  meta: m === 'smart' ? `${STEADY_COPY.suggested} ${STEADY_COPY.modeMeta[m]}` : STEADY_COPY.modeMeta[m],
}));

/**
 * How the house shares Johns, asked once a new house has its list: Smart
 * (chosen already, as every house starts) or Classic, each saying what it
 * means. A tap saves it; House rules can change it after.
 */
function ModeAsk({ houseId, start }: { houseId: string; start: DealMode }) {
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
      <Body>{STEADY_COPY.modeAsk}</Body>
      <Group testID="chat-mode">
        <View accessibilityRole="radiogroup" accessibilityLabel={STEADY_COPY.mode}>
          {MODES.map((m) => (
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
      <Meta>{`${STEADY_COPY.modeFoot} ${STEADY_COPY.modeLater}`}</Meta>
    </>
  );
}

/** Jonz's question, answered with a tap: a few quick answers as buttons, or a day as the app's day picker. */
function AskCard({ ask, weekStarts, onAnswer }: { ask: ChatAsk; weekStarts: IsoDow; onAnswer: (answer: string) => void }) {
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
      label={HOUSE_DRAFT_COPY.pickDay}
      value={0}
      options={days.map((d) => ({ value: d, label: DOW_LABEL[d].slice(0, 3), spoken: DOW_LABEL[d] }))}
      onChange={(d) => onAnswer(DOW_LABEL[d as IsoDow])}
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
  const editing = base !== null;
  const changes = draftChanges(base, draft);
  // A list's changes sorted by kind (taking off, changing, adding); a new house's Johns, opened, in the list's own order.
  const ordered = editing
    ? KINDS.flatMap((kind) => changes.filter((c) => c.kind === kind))
    : CATEGORIES.flatMap((cat) => changes.filter((c) => c.kind !== 'remove' && c.john.category === cat));
  const folded = editing ? CHANGES_FOLDED : FOLDED;
  const shown = open ? ordered : (editing ? ordered : changes).slice(0, folded);
  const groups = draft.groups.filter((g) => changes.some((c) => c.kind !== 'remove' && c.john.group === g.name));
  const waiting = groups.filter((g) => g.memberIds.length === 0);
  const after = afterApplying(base, changes, keep);
  const line = (j: DraftedJohn) => [scheduleLine({ ...j, dueDow: j.dueDow as IsoDow }, j.group), pointsLabel(j.points)].join(', ');
  const row = (c: DraftChange) => {
    const j = c.kind === 'remove' ? c.before : c.john;
    const meta = c.kind === 'change' ? changedLine(c.before, c.john) : [line(j), editing ? null : j.why || null].filter(Boolean).join(', ');
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
            {HOUSE_DRAFT_COPY.changesMeta(pointsAWeek(base.johns), pointsAWeek(after))}
          </Meta>
          {KINDS.map((kind) => {
            const these = shown.filter((c) => c.kind === kind);
            const all = changes.filter((c) => c.kind === kind).length;
            return these.length > 0 ? (
              <Section key={kind} label={KIND_HEADING[kind]} count={all} testID={`draft-${kind}s`}>
                {these.map(row)}
              </Section>
            ) : null;
          })}
        </>
      ) : (
        <Section label={HOUSE_DRAFT_COPY.draftLabel} right={HOUSE_DRAFT_COPY.draftMeta(keep.length, pointsAWeek(after))}>
          {shown.map(row)}
        </Section>
      )}
      {changes.length > folded ? (
        <TextButton
          label={open ? HOUSE_DRAFT_COPY.showLess : HOUSE_DRAFT_COPY.seeAll(changes.length)}
          onPress={() => onOpen(!open)}
          testID="draft-see-all"
        />
      ) : null}
      {open && groups.length > 0 ? (
        <Section label={HOUSE_DRAFT_COPY.groupsLabel} testID="draft-groups">
          {groups.map((g) => (
            <Row
              key={g.name}
              title={g.name}
              meta={[
                g.memberIds.length > 0 ? membersLine(g.memberIds, people, me) : null,
                g.waitingFor.length > 0 ? HOUSE_DRAFT_COPY.waiting(namesList(g.waitingFor)) : null,
              ]
                .filter(Boolean)
                .join(', ')}
              testID="draft-group"
            />
          ))}
        </Section>
      ) : null}
      {open && waiting.length > 0 ? (
        <Meta style={styles.inset}>{HOUSE_DRAFT_COPY.everyoneForNow(namesList(waiting.map((g) => g.name)))}</Meta>
      ) : null}
      {draft.note ? (
        <Meta style={styles.inset} testID="draft-note">
          {draft.note}
        </Meta>
      ) : null}
      {problem ? <Alert message={problem} /> : null}
      <Button
        label={
          pending
            ? editing
              ? HOUSE_DRAFT_COPY.applying
              : HOUSE_DRAFT_COPY.keeping
            : editing
              ? HOUSE_DRAFT_COPY.apply(keep.length)
              : HOUSE_DRAFT_COPY.keep(keep.length)
        }
        onPress={onKeep}
        disabled={pending || keep.length === 0}
        testID="describe-keep"
      />
    </View>
  );
}

const KIND_HEADING = {
  remove: HOUSE_DRAFT_COPY.removingHeading,
  change: HOUSE_DRAFT_COPY.changingHeading,
  add: HOUSE_DRAFT_COPY.addingHeading,
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
