import { draftProblems, draftRequest, draftTerms, formatDay, GIFT_LENGTHS, newPromotionCode, parsePeople, PASS_PURCHASES, planPrice, PROMOTION_AUDIENCES, PROMOTION_DRAFT, PROMOTION_DURATIONS, PROMOTION_ENDS, PROMOTION_KINDS, PROMOTION_LIMITS, promotionProblems, type PassPurchase, type PromotionDraft, type PromotionMade, wordsFor } from '@app/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { EyeIcon, SparklesIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { makePromotion, PROMOTIONS_KEY } from '@/api/promotions';
import { PromotionPreview } from '@/components/admin/promotion-parts';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field, FieldLabel } from '@/components/field';
import { Group } from '@/components/group';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useToast } from '@/components/toast';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

// The owner's pages are in English for now (translation 6).
const english = wordsFor('en', 'housemates');
const PLAN_LABEL: Record<PassPurchase, string> = { yearly: english('house.pass.yearly'), monthly: english('house.pass.monthly'), founding: english('house.pass.foundingPlan') };

/**
 * A new promotion, to fill in and make: money off the House Pass, some
 * months free, or a free Pass, for anyone with its link or only for the
 * people named on it. Making one opens its page, with the link to copy.
 * `beside` (the side panel of a laptop's Promotions) shows what they get
 * under the form; otherwise that opens as a sheet from its own button.
 */
export function PromotionForm({ beside = false }: { beside?: boolean }) {
  const words = useWords();
  const toast = useToast();
  const router = useRouter();
  const client = useQueryClient();
  // The code's two digits, picked once, so it doesn't change as the name is typed.
  const [seed] = useState(() => Math.random());
  const [form, setForm] = useState<PromotionDraft>(PROMOTION_DRAFT);
  const [codeTyped, setCodeTyped] = useState(false);
  const [tried, setTried] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const set = (patch: Partial<PromotionDraft>) => setForm((current) => ({ ...current, ...patch }));

  const draft = { ...form, code: codeTyped ? form.code : form.name.trim() ? newPromotionCode(form.name, () => seed) : '' };
  const request = draftRequest(draft);
  const problems = { ...promotionProblems(request, new Date()), ...draftProblems(draft) };
  const ok = Object.keys(problems).length === 0;
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);
  const emails = parsePeople(form.people).emails;

  const make = useMutation({
    mutationFn: makePromotion,
    onSuccess: (made: PromotionMade) => {
      void client.invalidateQueries({ queryKey: PROMOTIONS_KEY });
      toast.show(made.ready ? words('admin.promotions.made') : words('admin.promotions.madeNotReady'));
      router.push(`/admin/promotions/${made.id}` as never);
    },
  });
  const onMake = () => {
    setTried(true);
    if (ok) make.mutate(request);
  };

  const money = form.kind === 'percent' || form.kind === 'amount';
  const needsMonths = form.kind === 'trial' || (money && form.duration === 'months') || (form.kind === 'gift' && form.gift === 'months');
  const preview = (titled: boolean) => (
    <PromotionPreview
      titled={titled}
      terms={draftTerms(request)}
      note={request.note}
      audience={form.audience}
      emails={emails}
      maxUses={request.maxUses}
    />
  );

  return (
    <>
      <View style={styles.form} testID="promotion-form">
        <Field
          label={words('admin.promotions.name')}
          value={form.name}
          onChangeText={(name) => set({ name })}
          problem={shown('name')}
          hint={words('admin.promotions.nameHint')}
          maxLength={PROMOTION_LIMITS.name}
          testID="promotion-name"
        />
        <View style={styles.group}>
          <FieldLabel>{words('admin.promotions.gives')}</FieldLabel>
          <Segmented
            label={words('admin.promotions.gives')}
            options={PROMOTION_KINDS.map((kind) => ({ value: kind, label: words(`admin.promotions.kind.${kind}` as const) }))}
            value={form.kind}
            onChange={(kind) => set({ kind })}
            equal
            testID="promotion-kind"
          />
        </View>
        {form.kind === 'percent' ? (
          <Field
            label={words('admin.promotions.percent')}
            value={form.percent}
            onChangeText={(percent) => set({ percent })}
            problem={shown('gives')}
            keyboardType="number-pad"
            maxLength={4}
            testID="promotion-percent"
          />
        ) : null}
        {form.kind === 'amount' ? (
          <Field
            label={words('admin.promotions.amount')}
            value={form.amount}
            onChangeText={(amount) => set({ amount })}
            problem={shown('gives')}
            hint={words('admin.promotions.amountHint')}
            keyboardType="decimal-pad"
            maxLength={8}
            testID="promotion-amount"
          />
        ) : null}
        {money ? (
          <View style={styles.group}>
            <FieldLabel>{words('admin.promotions.duration')}</FieldLabel>
            <Segmented
              label={words('admin.promotions.duration')}
              options={PROMOTION_DURATIONS.map((d) => ({ value: d, label: words(`admin.promotions.durations.${d}` as const) }))}
              value={form.duration}
              onChange={(duration) => set({ duration })}
              equal
              testID="promotion-duration"
            />
          </View>
        ) : null}
        {form.kind === 'gift' ? (
          <View style={styles.group}>
            <FieldLabel>{words('admin.promotions.giftLength')}</FieldLabel>
            <Segmented
              label={words('admin.promotions.giftLength')}
              options={GIFT_LENGTHS.map((g) => ({ value: g, label: words(`admin.promotions.giftLengths.${g}` as const) }))}
              value={form.gift}
              onChange={(gift) => set({ gift })}
              equal
              testID="promotion-gift"
            />
            <Meta>{words('admin.promotions.giftHint')}</Meta>
          </View>
        ) : null}
        {needsMonths ? (
          <Field
            label={words('admin.promotions.months')}
            value={form.months}
            onChangeText={(months) => set({ months })}
            problem={shown('months')}
            hint={form.kind === 'trial' ? words('admin.promotions.trialHint') : undefined}
            keyboardType="number-pad"
            maxLength={2}
            testID="promotion-months"
          />
        ) : null}
        {form.kind === 'gift' ? null : (
          <View style={styles.group}>
            <FieldLabel>{words('admin.promotions.plans')}</FieldLabel>
            <Group>
              {PASS_PURCHASES.map((plan) => {
                const off = form.kind === 'trial' && plan === 'founding';
                const on = form.plans.includes(plan) && !off;
                return (
                  <ChoiceRow
                    key={plan}
                    role="checkbox"
                    label={PLAN_LABEL[plan]}
                    meta={planPrice(plan)}
                    checked={on}
                    disabled={off}
                    onPress={() => set({ plans: on ? form.plans.filter((p) => p !== plan) : [...form.plans, plan] })}
                    testID={`promotion-plan-${plan}`}
                  />
                );
              })}
            </Group>
            {shown('plans') ? <Alert message={problems.plans!} /> : null}
          </View>
        )}
        <View style={styles.group}>
          <FieldLabel>{words('admin.promotions.who')}</FieldLabel>
          <Segmented
            label={words('admin.promotions.who')}
            options={PROMOTION_AUDIENCES.map((a) => ({ value: a, label: words(`admin.promotions.audiences.${a}` as const) }))}
            value={form.audience}
            onChange={(audience) => set({ audience })}
            equal
            testID="promotion-audience"
          />
        </View>
        {form.audience === 'named' ? (
          <Field
            label={emails.length ? `${words('admin.promotions.people')}, ${words('admin.promotions.peopleCount', { n: emails.length })}` : words('admin.promotions.people')}
            value={form.people}
            onChangeText={(people) => set({ people })}
            problem={shown('people')}
            hint={words('admin.promotions.peopleHint')}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            testID="promotion-people-box"
          />
        ) : (
          <Field
            label={words('admin.promotions.maxUses')}
            value={form.maxUses}
            onChangeText={(maxUses) => set({ maxUses })}
            problem={shown('maxUses')}
            hint={words('admin.promotions.maxUsesHint')}
            keyboardType="number-pad"
            maxLength={7}
            testID="promotion-max"
          />
        )}
        <View style={styles.group}>
          <FieldLabel>{words('admin.promotions.ends')}</FieldLabel>
          <Segmented
            label={words('admin.promotions.ends')}
            options={PROMOTION_ENDS.map((e) => ({ value: e, label: words(`admin.promotions.endsChoices.${e}` as const) }))}
            value={form.ends}
            onChange={(ends) => set({ ends, endsOn: form.endsOn || formatDay(new Date(Date.now() + 30 * 86_400_000)) })}
            equal
            testID="promotion-ends"
          />
          {form.ends === 'day' ? (
            <Field label={words('admin.promotions.endsOn')} value={form.endsOn} onChangeText={(endsOn) => set({ endsOn })} problem={shown('endsAt')} testID="promotion-ends-on" />
          ) : null}
        </View>
        <Field
          label={words('admin.promotions.note')}
          value={form.note}
          onChangeText={(note) => set({ note })}
          problem={shown('note')}
          hint={words('admin.promotions.noteHint')}
          maxLength={PROMOTION_LIMITS.note}
          testID="promotion-note"
        />
        <Field
          label={words('admin.promotions.code')}
          value={draft.code}
          onChangeText={(code) => {
            setCodeTyped(true);
            set({ code: code.toUpperCase().replace(/[^A-Z0-9]/g, '') });
          }}
          problem={shown('code')}
          hint={words('admin.promotions.codeHint')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={PROMOTION_LIMITS.code.max}
          testID="promotion-code"
        />
        {make.error ? <Alert message={make.error.message} testID="promotion-problem" /> : null}
        <View style={styles.group}>
          {beside ? (
            <ButtonRow>
              <Button label={words('admin.promotions.make')} busyLabel={words('admin.promotions.making')} icon={SparklesIcon} onPress={onMake} busy={make.isPending} testID="promotion-make" />
            </ButtonRow>
          ) : (
            <ButtonRow stacked>
              <Button label={words('admin.promotions.make')} busyLabel={words('admin.promotions.making')} icon={SparklesIcon} onPress={onMake} busy={make.isPending} testID="promotion-make" />
              <Button label={words('admin.promotions.see')} variant="outline" icon={EyeIcon} onPress={() => setPreviewing(true)} testID="promotion-preview-open" />
            </ButtonRow>
          )}
          <Meta>{words('admin.promotions.auditNote')}</Meta>
        </View>
        {beside ? preview(true) : null}
      </View>
      <Sheet visible={previewing} title={words('admin.promotions.whatTheyGet')} onClose={() => setPreviewing(false)} testID="promotion-preview-sheet">
        {preview(false)}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.xl },
  group: { gap: SPACE.sm },
});
