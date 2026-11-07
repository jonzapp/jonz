import { MOVING_COPY } from '@app/core';
import { Share2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Card } from '@/components/card';
import { InviteSheet } from '@/components/house-page/invite-sheet';
import { Body, SectionLabel } from '@/components/text';
import { SPACE } from '@/theme';

/**
 * For the people who stay when someone moves out (core askWhosMovingIn):
 * "Someone moving in?", and the house's join card a tap away, so the house
 * keeps going instead of drifting off. In outline: Today's amber stays on
 * your own next John.
 */
export function MoveInAsk({ houseName, joinCode }: { houseName: string; joinCode: string }) {
  const [inviting, setInviting] = useState(false);
  return (
    <>
      <Card testID="move-in-ask">
        <SectionLabel style={styles.label}>{MOVING_COPY.askTitle}</SectionLabel>
        <Body style={styles.body}>{MOVING_COPY.askBody(houseName)}</Body>
        <View style={styles.action}>
          <ButtonRow atEdge>
            <Button
              label={MOVING_COPY.askButton}
              icon={Share2Icon}
              variant="outline"
              onPress={() => setInviting(true)}
              testID="move-in-invite"
            />
          </ButtonRow>
        </View>
      </Card>
      <InviteSheet visible={inviting} onClose={() => setInviting(false)} code={joinCode} houseName={houseName} />
    </>
  );
}

const styles = StyleSheet.create({
  // Overpass's caps sit high in their line.
  label: { paddingTop: 2 },
  body: { marginTop: SPACE.sm },
  action: { marginTop: SPACE.lg },
});
