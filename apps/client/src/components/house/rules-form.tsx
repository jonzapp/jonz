import {
  AWAY_MAKEUP,
  checkRules,
  familyHides,
  CURRENCIES,
  COVER_GRACE_HOURS,
  LATE_HOURS,
  CURRENCY_SYMBOL,
  DISPUTE_HOURS,
  DOW_LABEL,
  MAKEUP_LABEL,
  RULES_COPY,
  rulesChanged,
  rulesDraft,
  rulesRefusalField,
  SETTLE_IN,
  SETUP_COPY,
  STEADY_COPY,
  DEAL_MODES,
  type Currency,
  type HouseKind,
  type HouseRules,
  type IsoDow,
  type RulesDraft,
  type RulesField,
  type SettleIn,
} from '@app/core';
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

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SYMBOL[c]} ${c}` }));
const DAY_OPTIONS = (Object.entries(DOW_LABEL) as [string, string][]).map(([day, name]) => ({ value: Number(day) as IsoDow, label: name }));
const DISPUTE_OPTIONS = DISPUTE_HOURS.map((h) => ({ value: h as number, label: RULES_COPY.disputeHours(h), short: SETUP_COPY.disputeShort(h) }));
const LATE_OPTIONS = LATE_HOURS.map((h) => ({ value: h as number, label: RULES_COPY.lateHours(h), short: SETUP_COPY.lateShort(h) }));
const COVER_OPTIONS = COVER_GRACE_HOURS.map((h) => ({ value: h as number, label: RULES_COPY.coverGrace(h), short: SETUP_COPY.coverShort(h) }));
const MAKEUP_OPTIONS = AWAY_MAKEUP.map((n) => ({ value: n as number, label: MAKEUP_LABEL[n] }));
const SETTLE_OPTIONS = SETTLE_IN.map((s) => ({ value: s, label: RULES_COPY.settleInOption[s], short: SETUP_COPY.settleInValue[s] }));

// Smart is the suggested one.
const MODE_OPTIONS = DEAL_MODES.map((m) => ({
  value: m,
  label: STEADY_COPY.modeName[m],
  meta: m === 'smart' ? `${STEADY_COPY.suggested} ${STEADY_COPY.modeMeta[m]}` : STEADY_COPY.modeMeta[m],
}));
const BUDGET_PLAIN = [2, 4, 6, 0].map((b) => ({ value: b, label: STEADY_COPY.budgetName(b) }));

/** What the form starts from: the house's name, its rules, its make-up rate, where it settles up, and who lives there (for the budget's effects). */
export interface RulesValues {
  name: string;
  rules: HouseRules;
  awayMakeup: number;
  settleIn: SettleIn;
  memberIds: readonly string[];
  /** A family has no stake, so its Money section is only the currency. */
  kind?: HouseKind;
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
  const move = useMove(houseId);
  const [start] = useState(() => rulesDraft(values.name, values.rules, values.awayMakeup, values.settleIn));
  const [draft, setDraft] = useState<RulesDraft>(start);
  const [problems, setProblems] = useState<Partial<Record<RulesField, string>>>({});

  const set = (patch: Partial<RulesDraft>) => {
    setDraft((old) => ({ ...old, ...patch }));
    // A field's problem goes once it's changed, and the one by Save once anything is.
    setProblems((old) => Object.fromEntries(Object.entries(old).filter(([key]) => !(key in patch) && key !== 'form')));
  };

  async function save() {
    const checked = checkRules(draft);
    if (checked.problems) {
      setProblems(checked.problems);
      return;
    }
    setProblems({});
    let refusal = '';
    const saved = await move.run(async () => {
      try {
        await updateHouse(houseId, checked.settings);
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
  const { draft: v, set, problems, pending } = form;
  const phoneZone = deviceTimeZone();
  const symbol = CURRENCY_SYMBOL[v.currency];
  const budget = useBudgetChoices(form.houseId, form.memberIds, v.dealMode);
  const budgetOptions = budget
    ? budget.choices.map((c) => ({ value: c.budget, label: c.label, meta: c.suggested ? `${STEADY_COPY.suggested} ${c.effect}` : c.effect }))
    : BUDGET_PLAIN;

  const noStake = familyHides(form.kind).stake;
  // A family has no vote, so no window to dispute in: a kid's tick waits for a parent's OK.
  const noVote = familyHides(form.kind).vote;
  const money = [
    { key: 'stake', label: RULES_COPY.stake(symbol), testID: 'house-stake' },
    { key: 'late', label: RULES_COPY.late(symbol), testID: 'house-late' },
    { key: 'missed', label: RULES_COPY.missed(symbol), testID: 'house-missed' },
  ] as const;
  const moneyFields = noStake ? [] : money;

  return (
    <>
      <View style={styles.noted}>
        <Section label={STEADY_COPY.workload} testID="rules-workload">
          <PickRow
            label={STEADY_COPY.mode}
            options={MODE_OPTIONS}
            value={v.dealMode}
            onChange={(dealMode) => set({ dealMode })}
            disabled={pending}
            testID="rules-mode"
          />
          <PickRow
            label={STEADY_COPY.budget}
            options={budgetOptions}
            value={v.dealBudget}
            onChange={(dealBudget) => set({ dealBudget })}
            disabled={pending}
            testID="rules-budget"
          />
        </Section>
        <Meta style={styles.note} testID="rules-workload-note">
          {[STEADY_COPY.modeFoot, STEADY_COPY.budgetFoot, budget?.tooLong ? STEADY_COPY.tooLong(budget.need) : null].filter(Boolean).join(' ')}
        </Meta>
      </View>
      <Section label={SETUP_COPY.money} testID="rules-money">
        <PickRow
          label={RULES_COPY.currency}
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
        {noStake ? null : (
          <PickRow
            label={RULES_COPY.settleIn}
            options={SETTLE_OPTIONS}
            value={v.settleIn}
            onChange={(settleIn: SettleIn) => set({ settleIn })}
            disabled={pending}
          />
        )}
      </Section>
      <View style={styles.noted}>
        <Section label={SETUP_COPY.fairness} testID="rules-fairness">
          {noVote ? null : (
            <PickRow
              label={SETUP_COPY.disputes}
              options={DISPUTE_OPTIONS}
              value={v.disputeHours}
              onChange={(disputeHours) => set({ disputeHours })}
              disabled={pending}
            />
          )}
          <PickRow
            label={SETUP_COPY.lateWindow}
            options={LATE_OPTIONS}
            value={v.lateHours}
            onChange={(lateHours) => set({ lateHours })}
            disabled={pending}
          />
          <PickRow
            label={SETUP_COPY.cover}
            options={COVER_OPTIONS}
            value={v.coverGraceHours}
            onChange={(coverGraceHours) => set({ coverGraceHours })}
            disabled={pending}
          />
          <PickRow
            label={SETUP_COPY.away}
            options={MAKEUP_OPTIONS}
            value={v.awayMakeup}
            onChange={(awayMakeup) => set({ awayMakeup })}
            disabled={pending}
          />
        </Section>
        <Meta style={styles.note}>{`${RULES_COPY.awayNote} ${RULES_COPY.makeupHint[v.awayMakeup]}`}</Meta>
      </View>
      <Section label={SETUP_COPY.house} testID="rules-house">
        <GroupItem>
          <Field
            label={RULES_COPY.name}
            value={v.name}
            onChangeText={(name) => set({ name })}
            maxLength={60}
            editable={!pending}
            problem={problems.name}
            testID="rules-name"
          />
        </GroupItem>
        <PickRow
          label={RULES_COPY.weekStarts}
          options={DAY_OPTIONS}
          value={v.weekStarts}
          onChange={(weekStarts) => set({ weekStarts })}
          disabled={pending}
        />
        <GroupItem>
          <Field
            label={RULES_COPY.timezone}
            value={v.timezone}
            onChangeText={(timezone) => set({ timezone })}
            autoCapitalize="none"
            autoCorrect={false}
            hint={RULES_COPY.timezoneHint}
            editable={!pending}
            problem={problems.timezone}
            testID="rules-timezone"
          />
          {phoneZone !== v.timezone ? (
            <TextButton label={RULES_COPY.phoneZone(phoneZone)} align="start" onPress={() => set({ timezone: phoneZone })} />
          ) : null}
        </GroupItem>
      </Section>
    </>
  );
}

/**
 * The rules form's foot, pinned under the page while it's open so Save is
 * always in reach: a refusal no field owns, then Save (the screen's one
 * amber button, waiting for a change) and Cancel, which puts the form away
 * unsaved. It keeps to the page's width, on the leading edge.
 */
export function RulesFoot({ form, onCancel }: { form: RulesFormState; onCancel: () => void }) {
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
            label={form.pending ? RULES_COPY.saving : RULES_COPY.save}
            disabled={form.pending || !form.changed}
            onPress={() => void form.save()}
            testID="save-rules"
          />
          <Button variant="outline" label={SETUP_COPY.cancel} disabled={form.pending} onPress={onCancel} testID="cancel-rules" />
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
