import { offersTour, TOUR_COPY } from '@app/core';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Group } from '@/components/group';
import { Body, RowTitle } from '@/components/text';
import { useTour } from '@/components/tour/tour-context';
import { useMembership } from '@/hooks/use-membership';
import { INSET, SPACE } from '@/theme';

/**
 * Today's one-time offer of its tour, for someone new (`offersTour`): Show
 * me starts it, Not now puts the offer away for good. Either way the tour
 * stays in Help. Outlined, not amber: Today's one amber button stays Next
 * up's. It never starts by itself, and it's not shown while a
 * tour is already playing.
 */
export function TourOffer({ now }: { now: Date }) {
  const tours = useTour();
  const { session } = useMembership();
  const signedUp = session?.user.created_at ? new Date(session.user.created_at) : null;
  if (!tours || tours.running || !offersTour(tours.saved, signedUp, now)) return null;
  return (
    <Group testID="tour-offer">
      <View style={styles.offer}>
        <RowTitle>{TOUR_COPY.offerTitle}</RowTitle>
        <Body>{TOUR_COPY.offerBody}</Body>
        <ButtonRow>
          <Button label={TOUR_COPY.offerYes} variant="outline" onPress={() => tours.start('today')} testID="tour-offer-yes" />
          <Button label={TOUR_COPY.offerNo} variant="ghost" onPress={tours.dismissOffer} testID="tour-offer-no" />
        </ButtonRow>
      </View>
    </Group>
  );
}

const styles = StyleSheet.create({
  offer: { padding: INSET, gap: SPACE.sm },
});
