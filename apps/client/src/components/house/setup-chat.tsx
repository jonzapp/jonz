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
  withAlpha,
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
import { ArrowUpIcon, CheckIcon, MinusIcon, PencilIcon, PlusIcon } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';

import { applyDraft, sendChat } from '@/api/draft';
import { saveDealMode } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { ResetsCard } from '@/components/house/resets-card';
import { stepsShown, Thinking, ThoughtFold } from '@/components/house/thinking';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Body, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useMove } from '@/hooks/use-move';
import { CONTENT_MAX, GUTTER, INSET, RADIUS, SECTION_GAP, SPACE, TAP, useTheme } from '@/theme';

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

/** The box's inside height for one line: a thumb tall with its edge. */
const LINE = TAP - 2;
/** The message box at its tallest: five lines, then it scrolls. */
const BOX_MAX = LINE + 4 * 24;
/** No focus ring of the browser's own round the words: the bubble round them darkens instead. */
const NO_RING = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
/** The send arrow's round, and its room from the bubble's edge (the same all round, one line tall). */
const SEND = 34;
const SEND_INSET = (LINE - SEND) / 2;

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
}) {
  const { colors, type } = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
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
  // How tall the words in the box come out, measured off-screen: the box grows to fit them, up to BOX_MAX.
  const [wordsHeight, setWordsHeight] = useState(0);
  // The bubble shows the focus, not the words inside it.
  const [focused, setFocused] = useState(false);
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
      // The next message starts from the list as it now is, read again from the house.
      setDraft(null);
      setRebase(true);
    }
  }

  const toggle = (key: string) => setKeep((was) => (was.includes(key) ? was.filter((k) => k !== key) : [...was, key]));
  const gated = editing && !passOpen;
  const nameOf = (id: string) => (id === me ? 'You' : (people.find((p) => p.userId === id)?.name ?? 'Someone'));

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.chat}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        testID="chat"
      >
        <View style={styles.said} testID="chat-greeting">
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
        </View>

        {turns.map((turn, at) => {
          if (turn.role === 'user') {
            return (
              <View key={at} style={[styles.bubble, { backgroundColor: colors.secondary }]} testID="chat-user">
                <Body>{turn.text}</Body>
              </View>
            );
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
              <View key={at} style={styles.said}>
                {row}
                <ModeAsk houseId={houseId} start={rules.dealMode} />
              </View>
            );
          }
          return (
            <View key={at} style={styles.said}>
              {turn.thought ? <ThoughtFold seconds={turn.thought.seconds} steps={turn.thought.steps} /> : null}
              {turn.text ? <Body testID="chat-reply">{turn.text}</Body> : null}
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
            </View>
          );
        })}

        {sending ? <Thinking steps={steps} /> : null}
      </ScrollView>

      {done ? null : gated ? (
        <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.composerLine} testID="chat-pass">
            <Meta>{HOUSE_DRAFT_COPY.passNeeded}</Meta>
            <Button variant="outline" label={HOUSE_DRAFT_COPY.seePass} href="/house/pass" testID="chat-see-pass" />
          </View>
        </View>
      ) : (
        <View style={[styles.composer, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <View style={styles.composerLine}>
            {problem ? <Alert message={problem} /> : null}
            {/* One bubble, as in the Claude app: the words, and the send arrow inside it at the bottom right. */}
            <View
              style={[styles.box, { borderColor: focused ? colors.foreground : colors.mutedForeground, backgroundColor: colors.card }]}
              testID="chat-box"
            >
              <View style={styles.field}>
                {/* The words as the box would wrap them, unseen, so the box can be as tall as they are. */}
                <Text
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  onLayout={(e) => setWordsHeight(e.nativeEvent.layout.height)}
                  style={[styles.input, styles.measure, type.body]}
                >
                  {`${text}\u200b`}
                </Text>
                <TextInput
                  accessibilityLabel={HOUSE_DRAFT_COPY.message}
                  placeholder={
                    !canChange
                      ? HOUSE_DRAFT_COPY.placeholderAsk
                      : editing && turns.length === 0
                      ? HOUSE_DRAFT_COPY.placeholderList
                      : draft
                        ? HOUSE_DRAFT_COPY.placeholderChange
                        : HOUSE_DRAFT_COPY.placeholder
                  }
                  placeholderTextColor={withAlpha(colors.mutedForeground, 0.7)}
                  value={text}
                  onChangeText={setText}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  maxLength={MESSAGE_MAX}
                  // As in other chat apps: one line while empty, the hint cut short rather than spilling; as you
                  // write it grows to show the whole message, up to BOX_MAX, then scrolls inside itself.
                  multiline
                  numberOfLines={1}
                  scrollEnabled
                  style={[
                    styles.input,
                    { fontFamily: type.body.fontFamily, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
                    { height: text ? Math.min(Math.max(wordsHeight, LINE), BOX_MAX) : LINE },
                    { color: colors.foreground },
                    NO_RING,
                  ]}
                  testID="chat-input"
                />
              </View>
              <SendButton onPress={() => void send(text)} disabled={busy || !text.trim()} />
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** The send arrow inside the message box: amber once there's something to send, quiet until then. */
function SendButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={HOUSE_DRAFT_COPY.send}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={SEND_INSET}
      testID="chat-send"
      style={({ pressed }) => [styles.send, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.sendDot, { backgroundColor: disabled ? colors.secondary : colors.hivis }]}>
        <ArrowUpIcon size={18} color={disabled ? colors.mutedForeground : colors.onHivis} aria-hidden />
      </View>
    </Pressable>
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
  fill: { flex: 1 },
  chat: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: GUTTER,
    paddingBottom: SECTION_GAP,
    gap: SPACE.xl,
  },
  said: { gap: SPACE.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  // What the admin said: on the tint, to the right, as a chosen button sits.
  bubble: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: RADIUS, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  card: { gap: SPACE.md },
  inset: { paddingHorizontal: INSET },
  composer: { borderTopWidth: StyleSheet.hairlineWidth },
  composerLine: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: GUTTER,
    paddingVertical: SPACE.sm,
    gap: SPACE.sm,
  },
  // The bubble: its edge round the words and the send arrow, which stays at its foot as the words grow.
  box: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: RADIUS * 2, paddingRight: SEND_INSET },
  field: { flex: 1 },
  input: { paddingLeft: SPACE.md, paddingRight: SPACE.sm, paddingVertical: SPACE.md - 1 },
  measure: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  // A thumb-sized target round a round arrow, sitting in the bubble's bottom-right corner.
  send: { width: SEND, height: LINE, alignItems: 'center', justifyContent: 'center' },
  sendDot: { width: SEND, height: SEND, borderRadius: SEND / 2, alignItems: 'center', justifyContent: 'center' },
});
