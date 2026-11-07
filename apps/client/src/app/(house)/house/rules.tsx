import { memberCan, PAGE_TITLE, roleCopy, rulesRows, SETUP_COPY } from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminsList } from '@/components/house/admins-list';
import { HousePage } from '@/components/house/house-page';
import { RulesFoot, RulesForm, useRulesForm, type RulesValues } from '@/components/house/rules-form';
import { Pair } from '@/components/page-columns';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { TextButton } from '@/components/text-button';
import { useToast } from '@/components/toast';
import { useHouse, type HouseView } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { usePull, useReadOnFocus } from '@/hooks/use-refresh';
import { TourSpot } from '@/components/tour/tour-spot';

/**
 * The house rules, pushed from House: the stake, the forfeits, disputes,
 * time away and the week, in plain words for everyone, with the admins who
 * can change them beside them (Admins was a page of its own). An admin's
 * Edit opens the form in their place, Save pinned under it; saving closes
 * it.
 */
export default function RulesScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return <RulesFor houseId={house!.id} userId={session!.user.id} />;
}

function RulesFor({ houseId, userId }: { houseId: string; userId: string }) {
  const toast = useToast();
  const { query, view } = useHouse(houseId, userId);
  // The rules don't come over Realtime: read them again on the way back here.
  useReadOnFocus(query.refetch);
  const { refreshing, pull } = usePull(houseId, query.refetch);
  const [editing, setEditing] = useState(false);
  const page = {
    title: PAGE_TITLE.rules,
    ready: view !== null,
    failed: query.isError,
    onRetry: () => void query.refetch(),
    refreshing,
    onRefresh: pull,
  };

  if (view && memberCan(view.me, 'house.settings') && editing) {
    const { snapshot } = view;
    const values = {
      name: snapshot.house.name,
      rules: snapshot.rules,
      awayMakeup: snapshot.house.awayMakeup,
      settleIn: snapshot.house.settleIn,
      memberIds: snapshot.members.map((m) => m.userId),
      kind: snapshot.house.kind,
      pocketCapMinor: snapshot.house.pocketCapMinor,
    };
    return (
      <RulesEditing
        // A fresh form whenever the house's rules change underneath it.
        key={JSON.stringify(values)}
        houseId={houseId}
        values={values}
        page={page}
        onSaved={() => {
          setEditing(false);
          toast.show(SETUP_COPY.saved);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <HousePage {...page} testID="rules-screen" fills>
      {() => <RulesReadOut houseId={houseId} userId={userId} view={view!} onEdit={() => setEditing(true)} />}
    </HousePage>
  );
}

/**
 * The rules as everyone reads them, with Edit for an admin, and beside them
 * on a laptop (under them on a phone) the admins: who can change them.
 */
function RulesReadOut({ houseId, userId, view, onEdit }: { houseId: string; userId: string; view: HouseView; onEdit: () => void }) {
  const { snapshot } = view;
  const isAdmin = memberCan(view.me, 'house.settings');
  return (
    <Pair
      testID="rules-pair"
      start={
        <TourSpot id="rules.form">
        <Section
          label={SETUP_COPY.rules}
          right={isAdmin ? <TextButton label={SETUP_COPY.edit} align="end" onPress={onEdit} testID="edit-rules" /> : undefined}
          testID="rules-panel"
        >
          {rulesRows(
            snapshot.rules,
            snapshot.house.awayMakeup,
            snapshot.house.settleIn,
            snapshot.house.kind,
            snapshot.house.pocketCapMinor,
          ).map((rule) => (
            <Row key={rule.label} title={rule.label} trailing={rule.value} testID="rule" />
          ))}
        </Section>
        </TourSpot>
      }
      end={
        <Section label={roleCopy(snapshot.house.kind).admins.title} bare testID="admins-section">
          <AdminsList houseId={houseId} userId={userId} view={view} />
        </Section>
      }
    />
  );
}

/** The form an admin changes the rules in: the page scrolls its fields, and Save and Cancel stay pinned under it. */
function RulesEditing({
  houseId,
  values,
  page,
  onSaved,
  onCancel,
}: {
  houseId: string;
  values: RulesValues;
  page: Omit<Parameters<typeof HousePage>[0], 'testID' | 'children'>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const form = useRulesForm(houseId, values, onSaved);
  return (
    <View style={styles.fill} testID="rules-screen">
      <HousePage {...page} testID="rules-editing">
        {() => <RulesForm form={form} />}
      </HousePage>
      <RulesFoot form={form} onCancel={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
