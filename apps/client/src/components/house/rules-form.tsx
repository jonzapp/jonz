import { AWAY_MAKEUP, checkRules, makeupHint, phoneZoneLine, type Words, familyHides, CURRENCIES, COVER_GRACE_HOURS, LATE_HOURS, CURRENCY_SYMBOL, DISPUTE_HOURS, dayChoices, MAKEUP_LABEL, rulesChanged, rulesDraft, rulesRefusalField, SETTLE_IN, DEAL_MODES, type Currency, type HouseKind, type HouseRules, type RulesDraft, type RulesField, type SettleIn } from '@app/core';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { updateHouse } from '@/api/settings';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { GroupItem } from '@/components/group';
import { useContentWidth } from '@/components/screen';
import { Section } from '@/components/section';
import { PickRow } from '@/components/setup/pick-row';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { ButtonRow } from '@/components/button-row';
import { useBudgetChoices } from '@/hooks/use-budget';
import { useMove } from '@/hooks/use-move';
import { deviceTimeZone } from '@/locale';
import { GUTTER, INSET, LABEL_GAP, SPACE, useTheme, WIDE } from '@/theme';
import { useWords } from '@/hooks/use-words';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOL[c]} ${c}` }));
const disputeOptions = (words: Words) => DISPUTE_HOURS.map((h) => ({ value: h as number, label: words('house.rules.disputeHours', { hours: h }), short: words('house.setup.disputeShort', { hours: h }) }));
const lateOptions = (words: Words) => LATE_HOURS.map((h) => ({ value: h as number, label: words('house.rules.lateHours', { hours: h }), short: words('house.setup.lateShort', { hours: h }) }));
const coverOptions = (words: Words) => COVER_GRACE_HOURS.map((h) => ({ value: h as number, label: words('house.rules.coverGrace', { hours: h }), short: words('house.setup.coverShort', { hours: h }) }));
const MAKEUP_OPTIONS = AWAY_MAKEUP.map((n) => ({ value: n as number, label: MAKEUP_LABEL[n] }));
const settleOptions = (words: Words) =>
  SETTLE_IN.map((s) => ({ value: s, label: words(`house.rules.settleInOption.${s}` as const), short: words(`house.setup.settleInValue.${s}` as const) }));

// Smart is the suggested one.
const modeOptions = (words: Words) =>
  DEAL_MODES.map((m) => ({
    value: m,
    label: words(`week.steady.modeName.${m}` as const),
    meta: m === 'smart' ? `${words('week.steady.suggested')} ${words(`week.steady.modeMeta.${m}` as const)}` : words(`week.steady.modeMeta.${m}` as const),
  }));
const budgetPlain = (words: Words) => [2, 4, 6, 0].map((b) => ({ value: b, label: words('week.steady.budgetName', { budget: b }) }));

/** What the form starts from: the house's name, its rules, its make-up rate, where it settles up, and who lives there (for the budget's effects). */
export interface RulesValues {
  name: string;
  rules: HouseRules;
  awayMakeup: number;
  settleIn: SettleIn;
  memberIds: readonly string[];
  /** A family has no stake, so its Money section is the currency and pocket money. */
  kind?: HouseKind;
  /** In a family: the most each kid can earn in a month. */
  pocketCapMinor?: number;
}

/**
 * The rules as an admin changes them, held for both halves of the form: its
 * fields, which scroll with the page, and its foot, pinned under the page.
 * Save waits for a change. A problem goes under the field that's wrong:
 * checked here first, and the database's refusal too when it's about one
 * field (a time zone it doesn't know); anything else by Save. `onSaved` runs
 * once the database has the new rules.
 */
export function useRulesForm(houseId: string, values: RulesValues, onSaved: () => void) {
  const words = useWords();
  const move = useMove(houseId);
  const [start] = useState(() => rulesDraft(
      values.name,
      values.rules,
      values.awayMakeup,
      values.settleIn,
      values.kind === 'family' ? (values.pocketCapMinor ?? 0) : undefined,
    ),
  );
  const [draft, setDraft] = useState<RulesDraft>(start);
  const [problems, setProblems] = useState<Partial<Record<RulesField, string>>>({});

  const set = (patch: Partial<RulesDraft>) => {
    setDraft((old) => ({ ...old, ...patch }));
    // A field's problem goes once it's changed, and the one by Save once anything is.
    setProblems((old) => Object.fromEntries(Object.entries(old).filter(([key]) => !(key in patch) && key !== 'form')));
  };

  async function save() {
    const checked = checkRules(draft, words);
    if (checked.problems) {
      setProblems(checked.problems);
      return;
    }
    setProblems({});
    let refusal = '';
    const saved = await move.run(async () => {
      try {
        await updateHouse(houseId, checked.settings, words);
      } catch (reason) {
        refusal = reason instanceof Error ? reason.message : String(reason);
        throw reason;
      }
    });
    if (saved) onSaved();
    else setProblems({ [rulesRefusalField(refusal)]: refusal });
  }

  return { draft, set, problems, pending: move.pending, changed: rulesChanged(draft, start), save, houseId, memberIds: values.memberIds, kind: values.kind ?? 'housemates' };
}

export type RulesFormState = ReturnType<typeof useRulesForm>;

/**
 * The rules form's fields, in four sections: Workload (how the house shares
 * Johns, and the budget, each choice saying what it does to this house's
 * list), Money (the currency, the stake and the forfeits), Fairness
 * (disputes and time away) and House (its name, its week and its time zone).
 * Settings with a few values are rows that open in place; amounts are typed
 * as money and saved in minor units. Each problem shows under its field.
 * Several page children, so it goes straight in a Screen, with RulesFoot
 * pinned under that.
 */
export function RulesForm({ form }: { form: RulesFormState }) {
  return (
    <>
      <WorkloadRules form={form} />
      <MoneyRules form={form} />
      <FairnessRules form={form} />
      <HouseFields form={form} />
    </>
  );
}

/** How the week is dealt: the mode and the weekly budget, with what each means under them. */
function WorkloadRules({ form }: { form: RulesFormState }) {
  const words = useWords();
  const { draft: v, set, pending } = form;
  const budget = useBudgetChoices(form.houseId, form.memberIds, v.dealMode);
  const budgetOptions = budget
    ? budget.choices.map((c) => ({ value: c.budget, label: c.label, meta: c.suggested ? `${words('week.steady.suggested')} ${c.effect}` : c.effect }))
    : budgetPlain(words);
  return (
    <View style={styles.noted}>
      <Section label={words('week.steady.workload')} testID="rules-workload">
        <PickRow
          label={words('week.steady.mode')}
          options={modeOptions(words)}
          value={v.dealMode}
          onChange={(dealMode) => set({ dealMode })}
          disabled={pending}
          testID="rules-mode"
        />
        <PickRow
          label={words('week.steady.budget')}
          options={budgetOptions}
          value={v.dealBudget}
          onChange={(dealBudget) => set({ dealBudget })}
          disabled={pending}
          testID="rules-budget"
        />
      </Section>
      <Meta style={styles.note} testID="rules-workload-note">
        {[words('week.steady.modeFoot'), words('week.steady.budgetFoot'), budget?.tooLong ? words('week.steady.tooLong', { need: budget.need }) : null].filter(Boolean).join(' ')}
      </Meta>
    </View>
  );
}

/** The money: the currency, then a house's stake and what lateness costs, or a family's pocket money cap. */
function MoneyRules({ form }: { form: RulesFormState }) {
  const words = useWords();
  const { draft: v, set, problems, pending } = form;
  const symbol = CURRENCY_SYMBOL[v.currency];
  const noStake = familyHides(form.kind).stake;
  const money = [
    { key: 'stake', label: words('house.rules.stake', { symbol }), testID: 'house-stake' },
    { key: 'late', label: words('house.rules.late', { symbol }), testID: 'house-late' },
    { key: 'missed', label: words('house.rules.missed', { symbol }), testID: 'house-missed' },
  ] as const;
  const moneyFields = noStake ? [] : money;
  return (
    <Section label={words('house.setup.money')} testID="rules-money">
      <PickRow
        label={words('house.rules.currency')}
        options={CURRENCY_OPTIONS}
        value={v.currency}
        onChange={(currency: Currency) => set({ currency })}
        disabled={pending}
      />
      {moneyFields.map((m) => (
        <GroupItem key={m.key}>
          <Field
            label={m.label}
            value={v[m.key]}
            onChangeText={(text) => set({ [m.key]: text })}
            keyboardType="decimal-pad"
            editable={!pending}
            problem={problems[m.key]}
            testID={m.testID}
          />
        </GroupItem>
      ))}
      {noStake && v.pocket !== undefined ? (
        <GroupItem>
          <Field
            label={`${words('house.pocket.capField')} (${symbol})`}
            value={v.pocket}
            onChangeText={(pocket) => set({ pocket })}
            keyboardType="decimal-pad"
            hint={words('house.pocket.capFieldMeta')}
            editable={!pending}
            problem={problems.pocket}
            testID="house-pocket"
          />
        </GroupItem>
      ) : null}
      {noStake ? null : (
        <PickRow
          label={words('house.rules.settleIn')}
          options={settleOptions(words)}
          value={v.settleIn}
          onChange={(settleIn: SettleIn) => set({ settleIn })}
          disabled={pending}
        />
      )}
    </Section>
  );
}

/** The windows: to question a tick, to be late, to cover, and how time away is made up. */
function FairnessRules({ form }: { form: RulesFormState }) {
  const words = useWords();
  const { draft: v, set, pending } = form;
  // A family has no vote, so no window to dispute in: a kid's tick waits for a parent's OK.
  const noVote = familyHides(form.kind).vote;
  return (
    <View style={styles.noted}>
      <Section label={words('house.setup.fairness')} testID="rules-fairness">
        {noVote ? null : (
          <PickRow
            label={words('house.setup.disputes')}
            options={disputeOptions(words)}
            value={v.disputeHours}
            onChange={(disputeHours) => set({ disputeHours })}
            disabled={pending}
          />
        )}
        <PickRow
          label={words('house.setup.lateWindow')}
          options={lateOptions(words)}
          value={v.lateHours}
          onChange={(lateHours) => set({ lateHours })}
          disabled={pending}
        />
        <PickRow
          label={words('house.setup.cover')}
          options={coverOptions(words)}
          value={v.coverGraceHours}
          onChange={(coverGraceHours) => set({ coverGraceHours })}
          disabled={pending}
        />
        <PickRow
          label={words('house.setup.away')}
          options={MAKEUP_OPTIONS}
          value={v.awayMakeup}
          onChange={(awayMakeup) => set({ awayMakeup })}
          disabled={pending}
        />
      </Section>
      <Meta style={styles.note}>{words('common.join.then', { first: words('house.rules.awayNote'), second: makeupHint(v.awayMakeup, words) })}</Meta>
    </View>
  );
}

/** The house itself: its name, the day its week starts and its time zone. */
function HouseFields({ form }: { form: RulesFormState }) {
  const words = useWords();
  const { draft: v, set, problems, pending } = form;
  const phoneZone = deviceTimeZone();
  return (
    <Section label={words('house.setup.house')} testID="rules-house">
      <GroupItem>
        <Field
          label={words('house.rules.name')}
          value={v.name}
          onChangeText={(name) => set({ name })}
          maxLength={60}
          editable={!pending}
          problem={problems.name}
          testID="rules-name"
        />
      </GroupItem>
      <PickRow
        label={words('house.rules.weekStarts')}
        options={dayChoices(words).map((d) => ({ value: d.value, label: d.spoken }))}
        value={v.weekStarts}
        onChange={(weekStarts) => set({ weekStarts })}
        disabled={pending}
      />
      <GroupItem>
        <Field
          label={words('house.rules.timezone')}
          value={v.timezone}
          onChangeText={(timezone) => set({ timezone })}
          autoCapitalize="none"
          autoCorrect={false}
          hint={words('house.rules.timezoneHint')}
          editable={!pending}
          problem={problems.timezone}
          testID="rules-timezone"
        />
        {phoneZone !== v.timezone ? (
          <TextButton label={phoneZoneLine(phoneZone, words)} align="start" onPress={() => set({ timezone: phoneZone })} />
        ) : null}
      </GroupItem>
    </Section>
  );
}

/**
 * The rules form's foot, pinned under the page while it's open so Save is
 * always in reach: a refusal no field owns, then Save (the screen's one
 * amber button, waiting for a change) and Cancel, which puts the form away
 * unsaved. It keeps to the page's width, on the leading edge.
 */
export function RulesFoot({ form, onCancel }: { form: RulesFormState; onCancel: () => void }) {
  const words = useWords();
  const { colors } = useTheme();
  const width = useContentWidth();
  // From WIDE the page starts at its leading edge, and so does its foot.
  const leading = useWindowDimensions().width >= WIDE;
  return (
    <View style={[styles.foot, { backgroundColor: colors.background, borderTopColor: colors.border }]} testID="rules-foot">
      <View style={[styles.footInner, { maxWidth: width }, leading && styles.footLeading]}>
        {form.problems.form ? <Alert message={form.problems.form} /> : null}
        <ButtonRow>
          <Button
            label={words('house.rules.save')}
            busyLabel={words('house.rules.saving')}
            busy={form.pending}
            disabled={!form.changed}
            onPress={() => void form.save()}
            testID="save-rules"
          />
          <Button variant="outline" label={words('house.setup.cancel')} onPress={onCancel} testID="cancel-rules" />
        </ButtonRow>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noted: { gap: LABEL_GAP },
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
  foot: { borderTopWidth: StyleSheet.hairlineWidth },
  footLeading: { alignSelf: 'flex-start' },
  footInner: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: GUTTER + INSET,
    paddingVertical: SPACE.md,
    gap: SPACE.sm,
  },
});
