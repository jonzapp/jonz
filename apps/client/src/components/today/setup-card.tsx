import { NEXT_UP_COPY, setupChecklist } from '@app/core';
import { SparklesIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, CardRows } from '@/components/card';
import { DealButton } from '@/components/house/deal-button';
import { InviteSheet } from '@/components/house-page/invite-sheet';
import { Row, RowIcon } from '@/components/row';
import { Lead, SectionLabel } from '@/components/text';
import { TickBox } from '@/components/tick-box';
import { useAskJonz } from '@/hooks/use-ask-jonz';
import { SPACE } from '@/theme';

/** A checklist step's tick box: ticked once it's done. A picture, not a control: the row is the way in. */
function Step({ done }: { done: boolean }) {
  return <TickBox state={done ? 'done' : 'open'} label={done ? NEXT_UP_COPY.stateLabel.done : NEXT_UP_COPY.stateLabel.open} />;
}

/**
 * An admin's Today before anything is dealt, in Next up's place: the steps
 * to start the house. While the list is empty, Describe your house (Claude
 * drafts the Johns from a sentence or two). Add the Johns (the John list), invite the housemates
 * (House's invite sheet), then "Deal week 1", across the card, which becomes
 * the screen's amber button once the first two have something. It's there
 * before then too, in outline: the server says what's missing (no Johns
 * yet), and a house of one may deal alone.
 */
export function SetupCard({
  houseId,
  houseName,
  joinCode,
  johns,
  memberCount,
}: {
  houseId: string;
  houseName: string;
  joinCode: string;
  /** The John list; null while it's being read. */
  johns: readonly unknown[] | null;
  memberCount: number;
}) {
  const [inviting, setInviting] = useState(false);
  // Describe your house: the chat's page on a phone, the panel beside Today from WIDE.
  const ask = useAskJonz();
  const steps = setupChecklist(johns, memberCount);
  return (
    <>
      <Card testID="next-up">
        <SectionLabel style={styles.label}>{NEXT_UP_COPY.label}</SectionLabel>
        <Lead style={styles.lead}>{NEXT_UP_COPY.setUp(houseName)}</Lead>
        <CardRows testID="setup-steps">
          {steps.johnCount === 0 ? (
            <Row
              leading={<RowIcon icon={SparklesIcon} />}
              title={NEXT_UP_COPY.describe}
              meta={NEXT_UP_COPY.describeMeta}
              {...ask}
              chevron
              testID="setup-describe"
            />
          ) : null}
          <Row
            leading={<Step done={steps.johns} />}
            title={NEXT_UP_COPY.addJohns}
            meta={steps.johnCount === null ? undefined : NEXT_UP_COPY.onTheList(steps.johnCount)}
            href="/house/johns"
            chevron
            testID="setup-johns"
          />
          <Row
            leading={<Step done={steps.housemates} />}
            title={NEXT_UP_COPY.invite}
            meta={NEXT_UP_COPY.housemates(memberCount)}
            onPress={() => setInviting(true)}
            chevron
            testID="setup-invite"
          />
        </CardRows>
        <View style={styles.deal}>
          <DealButton houseId={houseId} label={NEXT_UP_COPY.dealWeek1} variant={steps.ready ? 'primary' : 'outline'} fill />
        </View>
      </Card>
      <InviteSheet visible={inviting} onClose={() => setInviting(false)} code={joinCode} houseName={houseName} />
    </>
  );
}

const styles = StyleSheet.create({
  // Overpass's caps sit high in their line.
  label: { paddingTop: 2 },
  lead: { marginTop: SPACE.sm },
  deal: { marginTop: SPACE.lg },
});
