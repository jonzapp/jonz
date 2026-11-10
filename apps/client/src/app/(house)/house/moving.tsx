import { dateRange, localDate, type IsoDow } from '@app/core';
import { CalendarXIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { setMovingOut } from '@/api/moving';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { GroupItem } from '@/components/group';
import { HousePage } from '@/components/house/house-page';
import { Pair, useSideBySide } from '@/components/page-columns';
import { Section } from '@/components/section';
import { AwayDates, type DateRange } from '@/components/setup/away-dates';
import { Body, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useHouse } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { useMove } from '@/hooks/use-move';
import { usePull } from '@/hooks/use-refresh';
import { INSET, SECTION_GAP, SPACE } from '@/theme';
import { SettingsOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * Moving out, pushed from House, You: the day you move out, picked from the
 * booking calendar time away uses, and "I'm staying after all" once it's
 * set. From that day the deal gives you nothing, and the house sees the
 * date on the Wall. Leaving itself stays at the foot of House.
 */
export default function MovingScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <MovingFor houseId={house!.id} userId={session!.user.id} />;
}

function MovingFor({ houseId, userId }: { houseId: string; userId: string }) {
  const words = useWords();
  const { query, view } = useHouse(houseId, userId);
  const { refreshing, pull } = usePull(houseId, () => query.refetch());
  const me = view?.snapshot.members.find((m) => m.userId === userId);
  const today = view ? localDate(view.now, view.snapshot.rules.timezone) : null;
  // Read here, not in the callback below: the React Compiler can hoist a field read out of it, before it's ready.
  const saved = me?.movingOutOn ?? null;
  const weekStarts = view?.snapshot.rules.weekStarts;
  return (
    <HousePage
      title={words('common.title.moving')}
      testID="moving-screen" outline={<SettingsOutline card />}
      fills
      ready={me !== undefined && today !== null}
      failed={query.isError}
      onRetry={() => void query.refetch()}
      refreshing={refreshing}
      onRefresh={pull}
    >
      {/* Whole values only: the React Compiler can hoist a field read out of this callback, before it's ready. */}
      {() => <MovingForm houseId={houseId} saved={saved} today={today!} weekStarts={weekStarts!} />}
    </HousePage>
  );
}

function MovingForm({
  houseId,
  saved,
  today,
  weekStarts,
}: {
  houseId: string;
  saved: string | null;
  today: string;
  weekStarts: IsoDow;
}) {
  const words = useWords();
  const move = useMove(houseId);
  const [picked, setPicked] = useState<string | null>(saved);
  // One day, not a run of them: whichever day was tapped last.
  const range: DateRange = { from: picked, to: picked };
  const changed = picked !== saved;

  // On a laptop what moving out does sits beside the day you pick; on a phone, the note under the calendar.
  const beside = useSideBySide();
  const note = <Meta style={styles.note}>{words('house.moving.afterward')}</Meta>;
  return (
    <Pair
      testID="moving-pair"
      ratio={0.8}
      start={
        <View style={beside ? styles.words : styles.page}>
          <Body style={styles.intro}>{words('house.moving.intro')}</Body>
          {beside ? note : null}
        </View>
      }
      end={
        <View style={styles.page}>
          {saved ? (
            <Section label={words('house.moving.title')}>
              <GroupItem>
                <Body testID="moving-saved">{words('house.moving.saved', { day: dateRange(saved, saved) })}</Body>
                <TextButton
                  label={words('house.moving.staying')}
                  icon={CalendarXIcon}
                  align="start"
                  disabled={move.pending}
                  onPress={() => {
                    setPicked(null);
                    void move.run(() => setMovingOut(null));
                  }}
                  testID="moving-clear"
                />
              </GroupItem>
            </Section>
          ) : null}
          <Section label={saved ? words('house.moving.change') : words('house.moving.pick')}>
            <GroupItem>
              <AwayDates
                today={today}
                weekStarts={weekStarts}
                value={range}
                onChange={(next) => setPicked(next.to ?? next.from)}
              />
              {move.problem ? <Alert message={move.problem} /> : null}
              <View style={styles.action}>
                <ButtonRow atEdge>
                  <Button
                    label={picked ? words('house.moving.save', { day: dateRange(picked, picked) }) : words('house.moving.pick')}
                    disabled={!picked || !changed}
                    busy={move.pending}
                    busyLabel={words('common.busy.saving')}
                    onPress={() => void move.run(() => setMovingOut(picked))}
                    testID="moving-save"
                  />
                </ButtonRow>
              </View>
            </GroupItem>
          </Section>
          {beside ? null : note}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { gap: SECTION_GAP },
  words: { gap: SPACE.md },
  intro: { paddingHorizontal: INSET },
  action: { marginTop: SPACE.sm },
  // A line under a group, on the leading edge.
  note: { paddingHorizontal: INSET },
});
