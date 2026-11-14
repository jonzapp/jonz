import {
  andNames,
  dayChoices,
  weekdayName,
  changesMeta,
  CATEGORIES,
  changedLine,
  DEAL_MODES,
  draftChanges,
  groupChanges,
  membersLine,
  pointsLabel,
  scheduleLine,
  type ChatAsk,
  type DealMode,
  type DraftChange,
  type DraftedJohn,
  type HouseDraft,
  type IsoDow,
  type Words,
} from '@app/core';
import { MinusIcon, PencilIcon, PlusIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { saveDealMode } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Body, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useMove } from '@/hooks/use-move';
import { INSET, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';
import { afterApplying, CHANGES_FOLDED, FOLDED, KINDS, Person, pointsAWeek } from './setup-chat-turns';

// The setup chat's cards: the deal-mode ask, a question's choices, and the draft list.

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
export function ModeAsk({ houseId, start }: { houseId: string; start: DealMode }) {
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
export function AskCard({ ask, weekStarts, onAnswer }: { ask: ChatAsk; weekStarts: IsoDow; onAnswer: (answer: string) => void }) {
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
export function DraftCard({
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
