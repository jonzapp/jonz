import { hasPass, LEGAL, passWords, type Words, type PassExtra, passFirstChargeNote, passLine, passOffers, passPurchaseRefusal, type PassPurchase } from '@app/core';
import { useLocalSearchParams } from 'expo-router';
import { CameraIcon, CheckIcon, CoinsIcon, CreditCardIcon, SparklesIcon, UserRoundIcon, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiRequestError } from '@/api/http';
import { leaveFor, passBillingUrl, passCheckoutOpen, passCheckoutUrl, passSelling } from '@/api/pass';
import { HousePage } from '@/components/house/house-page';
import { Pair } from '@/components/page-columns';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Body, Meta } from '@/components/text';
import { TextLink } from '@/components/text-link';
import { useToast } from '@/components/toast';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { INSET, SPACE } from '@/theme';
import { SettingsOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * The House Pass, pushed from House: where the house stands, what the Pass
 * gives everyone in it, and the plans. A Founding house sees its thanks in
 * place of the plans. On the web, with EXPO_PUBLIC_PASS_CHECKOUT=on and the
 * extras locked (PASS_ENFORCED), a plan opens Stripe Checkout; a buyer can
 * manage their plan whenever checkout is on. During the beta (nothing
 * locked) the plans are shown, not sold, and the page says it's free;
 * elsewhere buying waits for the store release, and the page says so.
 */
export default function PassScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <PassFor houseId={house!.id} userId={session!.user.id} />;
}

/** How often, and how many times, the page reads the house again after Checkout, until the webhook has landed. */
const BOUGHT_READ_MS = 3000;
const BOUGHT_READS = 10;

function PassFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  // A purchase lands from the store's webhook, not over Realtime.
  useReadOnFocus(query.refetch);
  const { refreshing, pull } = usePull(houseId, query.refetch);
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);

  // Back from Checkout: read again until the Pass shows, a few times at most.
  const bought = useLocalSearchParams<{ bought?: string }>().bought === '1';
  const waiting = bought && view?.snapshot.house.pass.plan === 'trial';
  const { refetch } = query;
  useEffect(() => {
    if (!waiting) return;
    let reads = 0;
    const timer = setInterval(() => {
      reads += 1;
      void refetch();
      if (reads >= BOUGHT_READS) clearInterval(timer);
    }, BOUGHT_READ_MS);
    return () => clearInterval(timer);
  }, [waiting, refetch]);

  /** Off to Stripe, or a toast saying why not. */
  async function go(url: () => Promise<string>) {
    setLeaving(true);
    try {
      leaveFor(await url());
    } catch (e) {
      setLeaving(false);
      toast.show(e instanceof ApiRequestError ? e.message : words('house.pass.checkoutClosed'));
    }
  }

  return (
    <HousePage
      title={view?.snapshot.house.kind === 'family' ? words('house.familyPass.title') : words('common.title.pass')}
      testID="pass-screen" outline={<SettingsOutline card />}
      fills
      ready={view !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      refreshing={refreshing}
      onRefresh={pull}
    >
      {() => (
        <PassReadOut
          view={view!}
          userId={userId}
          waiting={waiting}
          leaving={leaving}
          onBuy={(plan) => void go(() => passCheckoutUrl(houseId, plan))}
          onManage={() => void go(() => passBillingUrl(houseId))}
        />
      )}
    </HousePage>
  );
}

/**
 * The page once the house is read. Its own component, so `view` is never
 * null here: the React Compiler lifts reads of it out of a render callback
 * into the screen, where a first load (no house read yet) would throw.
 */
function PassReadOut({
  view,
  userId,
  waiting,
  leaving,
  onBuy,
  onManage,
}: {
  view: HouseView;
  userId: string;
  /** Back from Checkout, before the webhook has given the house its Pass. */
  waiting: boolean;
  /** On the way to Stripe: nothing more to press. */
  leaving: boolean;
  onBuy: (plan: PassPurchase) => void;
  onManage: () => void;
}) {
  const words = useWords();
  const { house, rules, members } = view.snapshot;
  const { now } = view;
  const { pass } = house;
  // A family's Pass is the Family Pass, with a family's extras.
  const sign = passWords(house.kind, words);
  const founding = pass.plan === 'founding';
  const buyer = pass.buyerId ? members.find((m) => m.userId === pass.buyerId)?.name : undefined;
  const checkout = passCheckoutOpen();
  // Nothing is sold while everyone has the extras anyway.
  const selling = passSelling();
  // Selling, a house sees only what it can buy now: a house on a paid plan changes it from Manage.
  const offers = passOffers(rules.currency, words).filter((o) => !selling || passPurchaseRefusal(pass, o.plan, now, words) === null);
  const canManage = checkout && pass.buyerId === userId && (pass.plan === 'monthly' || pass.plan === 'yearly');
  const firstCharge = selling ? passFirstChargeNote(pass, now, rules.timezone, words) : null;
  // Only once the free month or a plan has ended, so a new house isn't steered away from paying.
  const askFree = !hasPass(pass, now);
  return (
    <>
      <View style={styles.words}>
        <Body testID="pass-lead">{founding ? sign.foundingLead : sign.lead}</Body>
        {founding ? null : <Body testID="pass-promise">{sign.promise}</Body>}
        <Meta testID="pass-line">
          {buyer ? words('common.join.comma', { first: passLine(pass, now, rules.timezone, words), second: words('house.pass.boughtBy', { name: buyer }) }) : passLine(pass, now, rules.timezone, words)}
        </Meta>
        {waiting ? <Meta testID="pass-bought">{sign.bought}</Meta> : null}
      </View>

      <Pair
        testID="pass-pair"
        start={
          <Section label={sign.includes}>
            {sign.extras.map((extra) => (
              <Row key={extra.key} leading={<RowIcon icon={EXTRA_ICON[extra.key] ?? CheckIcon} />} title={extra.title} meta={extra.meta} />
            ))}
          </Section>
        }
        end={
          founding ? null : (
            <Section label={words('house.pass.plans')} testID="pass-plans">
              {canManage ? (
                <Row
                  leading={<RowIcon icon={CreditCardIcon} />}
                  title={words('house.pass.manage')}
                  meta={words('house.pass.manageMeta')}
                  onPress={onManage}
                  disabled={leaving}
                  chevron
                  testID="pass-manage"
                />
              ) : null}
              {offers.map((offer) => (
                <Row
                  key={offer.plan}
                  title={offer.label}
                  meta={offer.meta}
                  trailing={offer.price}
                  onPress={selling ? () => onBuy(offer.plan) : undefined}
                  disabled={!selling || leaving}
                  testID={`plan-${offer.plan}`}
                />
              ))}
            </Section>
          )
        }
      />

      <View style={styles.words}>
        {firstCharge ? <Meta testID="pass-first-charge">{firstCharge}</Meta> : null}
        {founding || selling ? null : (
          <Meta testID="pass-soon">{checkout ? words('house.pass.betaFree') : words('house.pass.buyingSoon')}</Meta>
        )}
        {selling ? <Meta testID="pass-renewal">{words('house.pass.renewal')}</Meta> : null}
        <Meta>{sign.free}</Meta>
        <Meta testID="pass-money">{words('house.pass.money')}</Meta>
        {askFree ? (
          <>
            <Meta testID="pass-hardship">{words('house.pass.hardship')}</Meta>
            <TextLink href={askFreeLink(words)} label={words('house.pass.askFree')} muted testID="pass-ask-free" />
          </>
        ) : null}
        <TextLink href="/terms" label={words('house.pass.terms')} muted testID="pass-terms" />
      </View>
    </>
  );
}

const EXTRA_ICON: Partial<Record<PassExtra['key'], LucideIcon>> = {
  money: CoinsIcon,
  proof: CameraIcon,
  help: SparklesIcon,
  pocket: CoinsIcon,
  kids: UserRoundIcon,
};

/** An email to whoever runs Jonz, for a house that can't pay. */
const askFreeLink = (words: Words) => `mailto:${LEGAL.email}?subject=${encodeURIComponent(words('house.pass.askFreeSubject'))}`;

const styles = StyleSheet.create({
  // On the leading edge, where the sections' labels start.
  words: { paddingHorizontal: INSET, gap: SPACE.sm },
});
