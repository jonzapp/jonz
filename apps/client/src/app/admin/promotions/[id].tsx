import { type Words, promotionGives, promotionSentence, promotionUsed, promotionWhoSentence, toEmail, wordsFor } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { MailIcon, RefreshCwIcon, TicketIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { emailPromotion, promotion, PROMOTIONS_KEY, retryPromotion, stopPromotion, type PromotionDetail } from '@/api/promotions';
import { PromotionLink, PromotionPeople } from '@/components/admin/promotion-parts';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { EmptyState } from '@/components/empty-state';
import { Group } from '@/components/group';
import { ReadFailed } from '@/components/read-state';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-mark';
import { Body, Meta } from '@/components/text';
import { TitleBar } from '@/components/title-bar';
import { useToast } from '@/components/toast';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { FORM_MAX, INSET, SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { PanelOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * One promotion: what it gives and who can use it, its link to copy or
 * share, Email them for the people it names, Try again while Stripe hasn't
 * set it up, and Stop. On a laptop who it's for, and the houses that used
 * it, sit beside.
 */
export default function PromotionPage() {
  const words = useWords();
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useQuery({ queryKey: [...PROMOTIONS_KEY, 'one', id], queryFn: () => promotion(id) });
  const title = read.data?.name ?? words('admin.promotions.page');
  return (
    <Screen spreads bar={<TitleBar title={title} back={'/admin/promotions' as never} backLabel={words('admin.promotions.page')} />} testID="admin-promotion">
      {read.isPending ? (
        <Waiting ready={false} outline={<PanelOutline sections={[3, 2]} button />} />
      ) : read.isError ? (
        <ReadFailed onRetry={() => void read.refetch()} />
      ) : read.data === null ? (
        <EmptyState icon={TicketIcon} title={words('admin.promotions.notFound')} />
      ) : (
        <Promotion p={read.data} />
      )}
    </Screen>
  );
}

function Promotion({ p }: { p: PromotionDetail }) {
  const words = useWords();
  const two = useColumns();
  const toast = useToast();
  const client = useQueryClient();
  const [stopping, setStopping] = useState(false);
  // Someone whose app role can't change promotions (support) reads it, with no buttons.
  const may = useOwnerMay('promotions:write');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fresh = () => void client.invalidateQueries({ queryKey: PROMOTIONS_KEY });

  const stop = useMutation({
    mutationFn: () => stopPromotion(p.id),
    onSuccess: () => {
      setStopping(false);
      toast.show(words('admin.promotions.stopped'));
      fresh();
    },
  });
  const retry = useMutation({
    mutationFn: () => retryPromotion(p.id),
    onSuccess: (ready) => {
      toast.show(ready ? words('admin.promotions.ready') : words('admin.promotions.stillNotReady'));
      fresh();
    },
  });
  const email = useMutation({
    mutationFn: () => emailPromotion(p.id),
    onSuccess: (sent) => {
      toast.show(words('admin.promotions.emailed', { n: sent }));
      fresh();
    },
  });

  const named = p.audience === 'named';
  const waiting = toEmail(p.people);
  const working = p.state === 'live';
  const emails = p.people.map((person) => person.email);

  const main = (
    <View style={[styles.main, two && styles.capped]}>
      <View style={styles.words}>
        <View style={styles.chips}>
          <Chip label={words(`admin.promotions.stateChip.${p.state}` as const)} tone={p.state === 'live' ? 'good' : 'quiet'} testID="promotion-state" />
          <Chip label={p.code} />
        </View>
        {p.note ? <Body>{p.note}</Body> : null}
        <Body testID="promotion-sentence">{promotionSentence(p.terms, zone)}</Body>
        <Meta>{promotionWhoSentence(p.audience, emails, p.maxUses, p.terms.endsAt, zone)}</Meta>
        <Meta testID="promotion-used">{`${promotionGives(p.terms)}. ${words('admin.promotions.usedLine', { used: promotionUsed({ audience: p.audience, people: p.people.length, uses: p.uses, maxUses: p.maxUses }) })}.`}</Meta>
      </View>
      {may && p.state === 'making' ? (
        <View style={styles.group}>
          <Alert message={words('admin.promotions.notReadyBody')} testID="promotion-not-ready" />
          <ButtonRow>
            <Button label={words('admin.promotions.tryAgain')} icon={RefreshCwIcon} onPress={() => retry.mutate()} busy={retry.isPending} busyLabel={words('common.busy.trying')} testID="promotion-retry" />
          </ButtonRow>
          {retry.error ? <Alert message={retry.error.message} /> : null}
        </View>
      ) : null}
      {working ? <PromotionLink code={p.code} title={p.name} /> : null}
      {may && named && working ? (
        <View style={styles.group}>
          <ButtonRow>
            <Button
              label={waiting === 0 ? words('admin.promotions.emailedAll') : words('admin.promotions.emailThem', { n: waiting })}
              icon={MailIcon}
              variant="outline"
              onPress={() => email.mutate()}
              disabled={waiting === 0}
              busy={email.isPending}
              busyLabel={words('common.busy.emailing')}
              testID="promotion-email"
            />
          </ButtonRow>
          <Meta>{words('admin.promotions.emailNote')}</Meta>
          {email.error ? <Alert message={email.error.message} /> : null}
        </View>
      ) : null}
      {!may || p.state === 'stopped' ? null : (
        <Group>
          <Row title={words('admin.promotions.stop')} tone="hazard" onPress={() => setStopping(true)} testID="promotion-stop" />
        </Group>
      )}
    </View>
  );

  const side = (
    <View style={styles.side}>
      {named ? <PromotionPeople people={p.people} /> : null}
      <Section label={words('admin.promotions.uses')} count={p.uses} testID="promotion-uses">
        {p.recent.length === 0 ? (
          <Row title={words('admin.promotions.noUses')} />
        ) : (
          p.recent.map((u, i) => (
            <Row
              key={`${u.houseId}-${i}`}
              title={u.house ?? words('admin.promotions.houseGone')}
              meta={[u.plan ? planName(u.plan) : null, new Date(u.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })].filter(Boolean).join(', ')}
              href={u.houseId ? ({ pathname: '/admin/houses', params: { open: u.houseId } } as never) : undefined}
              chevron={Boolean(u.houseId)}
            />
          ))
        )}
      </Section>
    </View>
  );

  return (
    <>
      {two ? (
        <Columns main={main} side={side} />
      ) : (
        <View style={styles.phone}>
          {main}
          {side}
        </View>
      )}
      <ConfirmSheet
        visible={stopping}
        title={words('admin.promotions.stopTitle')}
        body={words('admin.promotions.stopBody')}
        confirmLabel={words('admin.promotions.stop')}
        tone="hazard"
        busy={stop.isPending}
        busyLabel={words('common.busy.stopping')}
        problem={stop.error?.message ?? null}
        onConfirm={() => stop.mutate()}
        onClose={() => setStopping(false)}
        testID="promotion-stop-confirm"
      />
    </>
  );
}

// The owner's pages are in English for now (translation 6).
const english = wordsFor('en', 'housemates');
const PLAN_NAME: Record<string, string> = { yearly: english('house.pass.yearly'), monthly: english('house.pass.monthly'), founding: english('house.pass.foundingPlan'), trial: english('admin.promotions.kind.gift') };
const planName = (plan: string) => PLAN_NAME[plan] ?? plan;

const styles = StyleSheet.create({
  main: { gap: SPACE.xl },
  capped: { maxWidth: FORM_MAX, width: '100%' },
  words: { gap: SPACE.sm, paddingHorizontal: INSET },
  chips: { flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' },
  group: { gap: SPACE.sm },
  side: { gap: SPACE.xl },
  phone: { gap: SPACE.xxl },
});
