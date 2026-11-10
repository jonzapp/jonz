import { humanError, OFFER_PAGE_COPY, PROMOTION_COPY, type OfferView, type PassPurchase } from '@app/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { readOffer, takeOffer } from '@/api/offer';
import { leaveFor, passCheckoutOpen } from '@/api/pass';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { ReadFailed } from '@/components/read-state';
import { Row } from '@/components/row';
import { SignInPanel } from '@/components/sign-in-panel';
import { Body, Meta } from '@/components/text';
import { useMembership } from '@/hooks/use-membership';
import { SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { DoorOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * An offer's link: /offer/CODE. Open to anyone, like a join link, on a taped
 * sign: what it gives, the owner's note, what each plan costs with it. Signed
 * out, Sign in to use it signs you in here, so the code survives. Signed in,
 * Use it for whoever it's for: a free Pass is given there and then, and money
 * off or months free go on to Stripe Checkout with the offer on. Never who
 * else it's for. (The parameter is `offerCode`, not `code`: the web's Google
 * redirect comes back with a `?code=` of its own, and a refusal with `?error=`.)
 */
export default function Offer() {
  const { offerCode, error } = useLocalSearchParams<{ offerCode: string; error?: string }>();
  const { session } = useMembership();
  const [signingIn, setSigningIn] = useState(Boolean(error));
  const read = useQuery({
    queryKey: ['offer', offerCode, session?.user.id ?? null],
    queryFn: () => readOffer(offerCode),
  });

  return (
    <Door testID="offer-screen">
      <PageTitle page={read.data?.title ?? OFFER_PAGE_COPY.page} />
      {!session && signingIn ? (
        <SignInPanel next={`/offer/${offerCode}`} failed={Boolean(error)} />
      ) : read.isPending ? (
        <Waiting ready={false} outline={<DoorOutline />} />
      ) : read.isError ? (
        <Sign>
          <SignHeading title={OFFER_PAGE_COPY.page} />
          <ReadFailed onRetry={() => void read.refetch()} />
        </Sign>
      ) : read.data === null ? (
        <Sign testID="offer-unknown">
          <SignHeading title={OFFER_PAGE_COPY.unknown} body={OFFER_PAGE_COPY.unknownBody} />
          <Button href="/" variant="outline" label={OFFER_PAGE_COPY.goHome} />
        </Sign>
      ) : read.data.state === 'ended' ? (
        <Sign testID="offer-ended">
          <SignHeading title={OFFER_PAGE_COPY.ended} body={OFFER_PAGE_COPY.endedBody} />
          <Button href="/" variant="outline" label={OFFER_PAGE_COPY.goHome} />
        </Sign>
      ) : (
        <LiveOffer view={read.data} signedIn={Boolean(session)} onSignIn={() => setSigningIn(true)} />
      )}
    </Door>
  );
}

function LiveOffer({ view, signedIn, onSignIn }: { view: OfferView; signedIn: boolean; onSignIn: () => void }) {
  const words = useWords();
  const { house } = useMembership();
  const gift = view.kind === 'gift';
  const [plan, setPlan] = useState<PassPurchase | null>(view.prices[0]?.plan ?? null);
  const use = useMutation({
    mutationFn: (houseId: string) => takeOffer(houseId, gift ? 'yearly' : (plan ?? 'yearly'), view.code),
    onSuccess: (url) => {
      // A free Pass answers the Pass page, here on the site; anything else is Stripe's.
      if (gift) router.replace('/house/pass' as never);
      else leaveFor(url);
    },
  });

  const you = view.you;
  const mine = you ? (you.houses.find((h) => h.id === house?.id) ?? you.houses[0] ?? null) : null;
  // The plan check is made again with the plan picked; the rest stand.
  const refusal = mine?.refusal && mine.refusal !== 'offer_plan' ? humanError({ message: mine.refusal }) : null;
  const canBuy = gift || passCheckoutOpen();

  return (
    <Sign testID="offer-sign">
      <SignHeading above={OFFER_PAGE_COPY.giftFrom} title={view.title} body={view.sentence} />
      {view.note ? <Body testID="offer-note">{view.note}</Body> : null}
      {gift || view.prices.length === 0 ? null : (
        <View style={styles.prices} testID="offer-prices">
          {view.prices.map((p) => (
            <Row
              key={p.plan}
              title={p.label}
              meta={p.then ?? undefined}
              trailing={p.first}
              selected={view.prices.length > 1 && signedIn ? plan === p.plan : undefined}
              onPress={view.prices.length > 1 && signedIn ? () => setPlan(p.plan) : undefined}
              testID={`offer-price-${p.plan}`}
            />
          ))}
        </View>
      )}

      {!signedIn ? (
        <Button label={OFFER_PAGE_COPY.signIn} onPress={onSignIn} testID="offer-sign-in" />
      ) : !you ? null : !you.forYou ? (
        <Alert message={humanError({ message: 'offer_not_yours' })} testID="offer-not-yours" />
      ) : !mine ? (
        <View style={styles.group}>
          <Body muted>{OFFER_PAGE_COPY.noHouse}</Body>
          <ButtonRow>
            <Button href="/welcome" label={OFFER_PAGE_COPY.startHouse} />
          </ButtonRow>
        </View>
      ) : refusal ? (
        <View style={styles.group}>
          <Alert message={refusal} testID="offer-refused" />
          <ButtonRow>
            <Button href="/today" variant="outline" label={OFFER_PAGE_COPY.goToHouse} />
          </ButtonRow>
        </View>
      ) : !canBuy ? (
        <Meta testID="offer-web-only">{Platform.OS === 'web' ? words('house.pass.checkoutClosed') : OFFER_PAGE_COPY.webOnly}</Meta>
      ) : (
        <View style={styles.group}>
          {use.error ? <Alert message={use.error.message} /> : null}
          <ButtonRow>
            <Button
              label={PROMOTION_COPY.useIt}
              busyLabel={OFFER_PAGE_COPY.using}
              onPress={() => use.mutate(mine.id)}
              // Busy on through the way to checkout, after the server said yes.
              busy={use.isPending || use.isSuccess}
              testID="offer-use"
            />
          </ButtonRow>
          <Meta>{gift ? OFFER_PAGE_COPY.noCard : OFFER_PAGE_COPY.payNext}</Meta>
        </View>
      )}
      {you ? <Meta testID="offer-you">{OFFER_PAGE_COPY.signedInAs(you.email)}</Meta> : null}
    </Sign>
  );
}

const styles = StyleSheet.create({
  prices: { gap: SPACE.xs },
  group: { gap: SPACE.sm },
});
