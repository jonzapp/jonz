import { setupChecklist } from '@app/core';
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
import { useWords } from '@/hooks/use-words';
import { SPACE } from '@/theme';

/** A checklist step's tick box: ticked once it's done. A picture, not a control: the row is the way in. */
function Step({ done }: { done: boolean }) {
  const words = useWords();
  return <TickBox state={done ? 'done' : 'open'} label={done ? words('today.nextUp.stateLabel.done') : words('today.nextUp.stateLabel.open')} />;
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
  const words = useWords();
  // Describe your house: the chat's page on a phone, the panel beside Today from WIDE.
  const ask = useAskJonz();
  const steps = setupChecklist(johns, memberCount);
  return (
    <>
      <Card testID="next-up">
        <SectionLabel style={styles.label}>{words('today.nextUp.label')}</SectionLabel>
        <Lead style={styles.lead}>{words('today.nextUp.setUp', { house: houseName })}</Lead>
        <CardRows testID="setup-steps">
          {steps.johnCount === 0 ? (
            <Row
              leading={<RowIcon icon={SparklesIcon} />}
              title={words('today.nextUp.describe')}
              meta={words('today.nextUp.describeMeta')}
              {...ask}
              chevron
              testID="setup-describe"
            />
          ) : null}
          <Row
            leading={<Step done={steps.johns} />}
            title={words('today.nextUp.addJohns')}
            meta={steps.johnCount === null ? undefined : words('today.nextUp.onTheList', { count: steps.johnCount })}
            href="/house/johns"
            chevron
            testID="setup-johns"
          />
          <Row
            leading={<Step done={steps.housemates} />}
            title={words('today.nextUp.invite')}
            meta={words('today.nextUp.soFar', { count: memberCount })}
            onPress={() => setInviting(true)}
            chevron
            testID="setup-invite"
          />
        </CardRows>
        <View style={styles.deal}>
          <DealButton houseId={houseId} label={words('today.nextUp.dealWeek1')} variant={steps.ready ? 'primary' : 'outline'} fill />
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
