import { humanError, DELETE_HOUSE_COPY, FOCUS_SHELL_COPY, HOUSES_COPY, houseFacts, houseLead, passDetail, personMeta, type HouseDetail } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MegaphoneIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteHouse, ownerHouse } from '@/api/houses';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { PanelOutline } from '@/components/page-outlines';
import { ReadFailed } from '@/components/read-state';
import { Sheet } from '@/components/sheet';
import { Lead, Meta } from '@/components/text';
import { useToast } from '@/components/toast';
import { Waiting } from '@/components/waiting';
import { INSET, SPACE } from '@/theme';

/** The Houses list's reads, so the panel and the list share their cache. */
export const HOUSES_KEY = ['owner-houses'] as const;

/**
 * One house: when it started and its admins, each person with how they're
 * doing and any time away, its Pass and who pays, and the settings that
 * help with a support email, a row each. The one thing that changes it is Delete house,
 * for an owner who may (houses:write).
 */
export function HousePanel({ id }: { id: string }) {
  const house = useQuery({ queryKey: [...HOUSES_KEY, 'house', id], queryFn: () => ownerHouse(id) });
  if (house.isPending) return <Waiting ready={false} outline={<PanelOutline sections={[4, 3]} button />} />;
  if (house.isError) return <ReadFailed message={humanError(house.error)} onRetry={() => void house.refetch()} testID="house-panel-problem" />;
  if (!house.data) return <Meta style={styles.words}>{HOUSES_COPY.gone}</Meta>;
  return <HouseBody house={house.data} />;
}

function HouseBody({ house }: { house: HouseDetail }) {
  const pass = passDetail(house, new Date());
  return (
    <View style={styles.panel} testID="house-panel">
      <View style={styles.head}>
        <Lead header>{house.name}</Lead>
        <Meta>{houseLead(house)}</Meta>
      </View>
      <Section label={HOUSES_COPY.people}>
        {house.people.map((person) => (
          <Row
            key={person.id}
            leading={<Avatar name={person.name} userId={person.id} />}
            title={person.name}
            meta={personMeta(person)}
            testID={`house-person-${person.id}`}
          />
        ))}
      </Section>
      <Section label={HOUSES_COPY.money}>
        <Row title={pass.title} meta={pass.meta} testID="house-pass" />
      </Section>
      <Section label={HOUSES_COPY.details}>
        {houseFacts(house).map((fact) => (
          <Row key={fact.key} title={fact.label} trailing={fact.value} testID={`house-fact-${fact.key}`} />
        ))}
      </Section>
      <DeleteHouse house={house} />
    </View>
  );
}

/**
 * Delete house, at the foot of the house: a sheet that says what goes, asks
 * why (for the audit log) and whether to tell everyone, and only deletes once
 * the house's name is typed. Then it's back to Houses.
 */
function DeleteHouse({ house }: { house: HouseDetail }) {
  const may = useOwnerMay('houses:write');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [tell, setTell] = useState(true);
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => deleteHouse(house.id, reason, tell),
    onSuccess: (done) => {
      toast.show(done.passStopped === false ? `${DELETE_HOUSE_COPY.done(done.name)} ${DELETE_HOUSE_COPY.passNotStopped}` : DELETE_HOUSE_COPY.done(done.name));
      void queryClient.invalidateQueries();
      setOpen(false);
      router.replace('/admin/houses');
    },
  });
  if (!may) return <Meta style={styles.words}>{HOUSES_COPY.readOnly}</Meta>;
  const named = typed.trim().toLowerCase() === house.name.trim().toLowerCase();
  return (
    <>
      <ButtonRow>
        <Button variant="hazard" label={DELETE_HOUSE_COPY.button} onPress={() => setOpen(true)} testID="house-delete" />
      </ButtonRow>
      <Sheet
        visible={open}
        title={DELETE_HOUSE_COPY.title(house.name)}
        description={DELETE_HOUSE_COPY.body}
        onClose={() => setOpen(false)}
        testID="house-delete-sheet"
      >
        <Field label={DELETE_HOUSE_COPY.reason} value={reason} onChangeText={setReason} maxLength={500} testID="house-delete-reason" />
        <ChoiceRow role="checkbox" leading={<RowIcon icon={MegaphoneIcon} />} label={DELETE_HOUSE_COPY.tell} checked={tell} onPress={() => setTell(!tell)} testID="house-delete-tell" />
        <Field label={DELETE_HOUSE_COPY.confirm} value={typed} onChangeText={setTyped} placeholder={house.name} testID="house-delete-name" />
        {remove.error ? <Alert message={remove.error.message} /> : null}
        <ButtonRow stacked>
          <Button
            variant="hazard"
            label={DELETE_HOUSE_COPY.delete}
            busyLabel={DELETE_HOUSE_COPY.deleting}
            disabled={!named}
            busy={remove.isPending}
            onPress={() => remove.mutate()}
            testID="house-delete-confirm"
          />
          <Button variant="outline" label={FOCUS_SHELL_COPY.cancel} onPress={() => setOpen(false)} testID="house-delete-cancel" />
        </ButtonRow>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.xl },
  words: { paddingHorizontal: INSET },
  // Words on the page start where a card's do, as the section labels under them.
  head: { gap: SPACE.xs, paddingHorizontal: INSET },
});
