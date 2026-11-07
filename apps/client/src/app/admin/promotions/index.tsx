import {
  draftProblems,
  draftRequest,
  draftTerms,
  formatDay,
  GIFT_LENGTHS,
  newPromotionCode,
  parsePeople,
  PASS_PURCHASES,
  planPrice,
  PROMOTION_AUDIENCES,
  PROMOTION_DRAFT,
  PROMOTION_DURATIONS,
  PROMOTION_ENDS,
  PROMOTION_KINDS,
  PROMOTION_LIMITS,
  promotionMeta,
  promotionProblems,
  PROMOTIONS_COPY,
  PASS_COPY,
  type PassPurchase,
  type PromotionDraft,
  type PromotionMade,
} from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { EyeIcon, SparklesIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { makePromotion, PROMOTIONS_KEY, promotionsPage } from '@/api/promotions';
import { AdminSwitch } from '@/components/admin/admin-shell';
import { PromotionPreview } from '@/components/admin/promotion-parts';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field, FieldLabel } from '@/components/field';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TitleBar } from '@/components/title-bar';
import { useToast } from '@/components/toast';
import { FORM_MAX, SPACE } from '@/theme';

const RECENT = 5;

const PLAN_LABEL: Record<PassPurchase, string> = { yearly: PASS_COPY.yearly, monthly: PASS_COPY.monthly, founding: PASS_COPY.foundingPlan };

/**
 * Promotions: make money off the House Pass, some months free, or a free
 * Pass, for anyone with its link or only for the people named on it, and
 * see what they get before it's made. On a laptop what they get and the
 * last few made sit beside the form, as on Messages; on a phone the last
 * few are under it, and what they get opens as a sheet. Making one opens
 * its page, with the link to copy.
 */
export default function PromotionsPage() {
  return (
    <Screen spreads bar={<TitleBar title={PROMOTIONS_COPY.page} />} testID="admin-promotions">
      <AdminSwitch page="promotions" />
      <Promotions />
    </Screen>
  );
}

function Promotions() {
  const two = useColumns();
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
      toast.show(made.ready ? PROMOTIONS_COPY.made : PROMOTIONS_COPY.madeNotReady);
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

  const formView = (
    <View style={[styles.form, two && styles.capped]} testID="promotion-form">
      <Field
        label={PROMOTIONS_COPY.name}
        value={form.name}
        onChangeText={(name) => set({ name })}
        problem={shown('name')}
        hint={PROMOTIONS_COPY.nameHint}
        maxLength={PROMOTION_LIMITS.name}
        testID="promotion-name"
      />
      <View style={styles.group}>
        <FieldLabel>{PROMOTIONS_COPY.gives}</FieldLabel>
        <Segmented
          label={PROMOTIONS_COPY.gives}
          options={PROMOTION_KINDS.map((kind) => ({ value: kind, label: PROMOTIONS_COPY.kind[kind] }))}
          value={form.kind}
          onChange={(kind) => set({ kind })}
          equal
          testID="promotion-kind"
        />
      </View>
      {form.kind === 'percent' ? (
        <Field
          label={PROMOTIONS_COPY.percent}
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
          label={PROMOTIONS_COPY.amount}
          value={form.amount}
          onChangeText={(amount) => set({ amount })}
          problem={shown('gives')}
          hint={PROMOTIONS_COPY.amountHint}
          keyboardType="decimal-pad"
          maxLength={8}
          testID="promotion-amount"
        />
      ) : null}
      {money ? (
        <View style={styles.group}>
          <FieldLabel>{PROMOTIONS_COPY.duration}</FieldLabel>
          <Segmented
            label={PROMOTIONS_COPY.duration}
            options={PROMOTION_DURATIONS.map((d) => ({ value: d, label: PROMOTIONS_COPY.durations[d] }))}
            value={form.duration}
            onChange={(duration) => set({ duration })}
            equal
            testID="promotion-duration"
          />
        </View>
      ) : null}
      {form.kind === 'gift' ? (
        <View style={styles.group}>
          <FieldLabel>{PROMOTIONS_COPY.giftLength}</FieldLabel>
          <Segmented
            label={PROMOTIONS_COPY.giftLength}
            options={GIFT_LENGTHS.map((g) => ({ value: g, label: PROMOTIONS_COPY.giftLengths[g] }))}
            value={form.gift}
            onChange={(gift) => set({ gift })}
            equal
            testID="promotion-gift"
          />
          <Meta>{PROMOTIONS_COPY.giftHint}</Meta>
        </View>
      ) : null}
      {needsMonths ? (
        <Field
          label={PROMOTIONS_COPY.months}
          value={form.months}
          onChangeText={(months) => set({ months })}
          problem={shown('months')}
          hint={form.kind === 'trial' ? PROMOTIONS_COPY.trialHint : undefined}
          keyboardType="number-pad"
          maxLength={2}
          testID="promotion-months"
        />
      ) : null}
      {form.kind === 'gift' ? null : (
        <View style={styles.group}>
          <FieldLabel>{PROMOTIONS_COPY.plans}</FieldLabel>
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
        <FieldLabel>{PROMOTIONS_COPY.who}</FieldLabel>
        <Segmented
          label={PROMOTIONS_COPY.who}
          options={PROMOTION_AUDIENCES.map((a) => ({ value: a, label: PROMOTIONS_COPY.audiences[a] }))}
          value={form.audience}
          onChange={(audience) => set({ audience })}
          equal
          testID="promotion-audience"
        />
      </View>
      {form.audience === 'named' ? (
        <Field
          label={emails.length ? `${PROMOTIONS_COPY.people}, ${PROMOTIONS_COPY.peopleCount(emails.length)}` : PROMOTIONS_COPY.people}
          value={form.people}
          onChangeText={(people) => set({ people })}
          problem={shown('people')}
          hint={PROMOTIONS_COPY.peopleHint}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          testID="promotion-people-box"
        />
      ) : (
        <Field
          label={PROMOTIONS_COPY.maxUses}
          value={form.maxUses}
          onChangeText={(maxUses) => set({ maxUses })}
          problem={shown('maxUses')}
          hint={PROMOTIONS_COPY.maxUsesHint}
          keyboardType="number-pad"
          maxLength={7}
          testID="promotion-max"
        />
      )}
      <View style={styles.group}>
        <FieldLabel>{PROMOTIONS_COPY.ends}</FieldLabel>
        <Segmented
          label={PROMOTIONS_COPY.ends}
          options={PROMOTION_ENDS.map((e) => ({ value: e, label: PROMOTIONS_COPY.endsChoices[e] }))}
          value={form.ends}
          onChange={(ends) => set({ ends, endsOn: form.endsOn || formatDay(new Date(Date.now() + 30 * 86_400_000)) })}
          equal
          testID="promotion-ends"
        />
        {form.ends === 'day' ? (
          <Field label={PROMOTIONS_COPY.endsOn} value={form.endsOn} onChangeText={(endsOn) => set({ endsOn })} problem={shown('endsAt')} testID="promotion-ends-on" />
        ) : null}
      </View>
      <Field
        label={PROMOTIONS_COPY.note}
        value={form.note}
        onChangeText={(note) => set({ note })}
        problem={shown('note')}
        hint={PROMOTIONS_COPY.noteHint}
        maxLength={PROMOTION_LIMITS.note}
        testID="promotion-note"
      />
      <Field
        label={PROMOTIONS_COPY.code}
        value={draft.code}
        onChangeText={(code) => {
          setCodeTyped(true);
          set({ code: code.toUpperCase().replace(/[^A-Z0-9]/g, '') });
        }}
        problem={shown('code')}
        hint={PROMOTIONS_COPY.codeHint}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={PROMOTION_LIMITS.code.max}
        testID="promotion-code"
      />
      {make.error ? <Alert message={make.error.message} testID="promotion-problem" /> : null}
      <View style={styles.group}>
        {two ? (
          <ButtonRow>
            <Button label={make.isPending ? PROMOTIONS_COPY.making : PROMOTIONS_COPY.make} icon={SparklesIcon} onPress={onMake} disabled={make.isPending} testID="promotion-make" />
          </ButtonRow>
        ) : (
          <ButtonRow stacked>
            <Button label={make.isPending ? PROMOTIONS_COPY.making : PROMOTIONS_COPY.make} icon={SparklesIcon} onPress={onMake} disabled={make.isPending} testID="promotion-make" />
            <Button label={PROMOTIONS_COPY.see} variant="outline" icon={EyeIcon} onPress={() => setPreviewing(true)} testID="promotion-preview-open" />
          </ButtonRow>
        )}
        <Meta>{PROMOTIONS_COPY.auditNote}</Meta>
      </View>
    </View>
  );

  return (
    <>
      {two ? (
        <Columns
          main={formView}
          side={
            <View style={styles.side}>
              {preview(true)}
              <Recent />
            </View>
          }
        />
      ) : (
        <View style={styles.phone}>
          {formView}
          <Recent />
        </View>
      )}
      <Sheet visible={previewing} title={PROMOTIONS_COPY.whatTheyGet} onClose={() => setPreviewing(false)} testID="promotion-preview-sheet">
        {preview(false)}
      </Sheet>
    </>
  );
}

/** The last few made, newest first, and the way to all of them. */
function Recent() {
  const recent = useQuery({
    queryKey: [...PROMOTIONS_KEY, 'recent'],
    queryFn: () => promotionsPage(null, { q: '', who: null, state: null }, RECENT),
  });
  return (
    <Section
      label={PROMOTIONS_COPY.recent}
      right={<TextButton label={PROMOTIONS_COPY.all} href={'/admin/promotions/all' as never} chevron testID="promotion-all" />}
      testID="promotion-recent"
    >
      {recent.data && recent.data.items.length > 0 ? (
        recent.data.items.map((p) => (
          <Row key={p.id} title={p.name} meta={promotionMeta(p)} metaLines={2} href={`/admin/promotions/${p.id}` as never} chevron testID={`promotion-${p.code}`} />
        ))
      ) : (
        <Row title={PROMOTIONS_COPY.nothing} meta={PROMOTIONS_COPY.nothingBody} metaLines={2} />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.xl },
  capped: { maxWidth: FORM_MAX, width: '100%' },
  group: { gap: SPACE.sm },
  side: { gap: SPACE.xl },
  phone: { gap: SPACE.xxl },
});
