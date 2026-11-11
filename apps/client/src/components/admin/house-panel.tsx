import { humanError, houseFacts, houseLead, passDetail, personMeta, type HouseDetail } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { MegaphoneIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { deleteHouse, ownerHouse, ownerResetHouse } from '@/api/houses';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { DangerRow, DangerZone } from '@/components/danger-zone';
import { Field } from '@/components/field';
import { namesHouse } from '@/components/house/house-danger-zone';
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
import { useWords } from '@/hooks/use-words';

/** The Houses list's reads, so the panel and the list share their cache. */
export const HOUSES_KEY = ['owner-houses'] as const;

/**
 * One house: when it started and its admins, each person with how they're
 * doing and any time away, its Pass and who pays, and the settings that
 * help with a support email, a row each. What changes it is in the Danger
 * zone at its foot, for an owner who may (houses:write): Reset history,
 * Reset everything and Delete house.
 */
export function HousePanel({ id }: { id: string }) {
  const words = useWords();
  const house = useQuery({ queryKey: [...HOUSES_KEY, 'house', id], queryFn: () => ownerHouse(id) });
  if (house.isPending) return <Waiting ready={false} outline={<PanelOutline sections={[4, 3]} button />} />;
  if (house.isError) return <ReadFailed message={humanError(house.error)} onRetry={() => void house.refetch()} testID="house-panel-problem" />;
  if (!house.data) return <Meta style={styles.words}>{words('admin.houses.gone')}</Meta>;
  return <HouseBody house={house.data} />;
}

function HouseBody({ house }: { house: HouseDetail }) {
  const words = useWords();
  const pass = passDetail(house, new Date());
  return (
    <View style={styles.panel} testID="house-panel">
      <View style={styles.head}>
        <Lead header>{house.name}</Lead>
        <Meta>{houseLead(house)}</Meta>
      </View>
      <Section label={words('admin.houses.people')}>
        {house.people.map((person) => (
          <Row
            key={person.id}
            leading={<Avatar name={person.name} userId={person.id} />}
            title={person.name}
            meta={personMeta(person, house.kind)}
            testID={`house-person-${person.id}`}
          />
        ))}
      </Section>
      <Section label={words('admin.houses.money')}>
        <Row title={pass.title} meta={pass.meta} testID="house-pass" />
      </Section>
      <Section label={words('admin.houses.details')}>
        {houseFacts(house, words).map((fact) => (
          <Row key={fact.key} title={fact.label} trailing={fact.value} testID={`house-fact-${fact.key}`} />
        ))}
      </Section>
      <HouseDanger house={house} />
    </View>
  );
}

/**
 * The house's Danger zone (houses:write): Start over and Delete house, each
 * with its own sheet that says what goes, asks why (for the audit log) and
 * only goes ahead once the house's name is typed. A reset keeps the panel
 * open, the house back to before its first deal; deleting goes back to
 * Houses.
 */
function HouseDanger({ house }: { house: HouseDetail }) {
  const words = useWords();
  const may = useOwnerMay('houses:write');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<'history' | 'everything' | 'delete' | null>(null);
  const [reason, setReason] = useState('');
  const [tell, setTell] = useState(true);
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => deleteHouse(house.id, reason, tell),
    onSuccess: (done) => {
      toast.show(done.passStopped === false ? `${words('admin.deleteHouse.done', { name: done.name })} ${words('admin.deleteHouse.passNotStopped')}` : words('admin.deleteHouse.done', { name: done.name }));
      void queryClient.invalidateQueries();
      setOpen(null);
      router.replace('/admin/houses');
    },
  });
  const restart = useMutation({
    mutationFn: (everything: boolean) => ownerResetHouse(house.id, everything, reason),
    onSuccess: (_done, everything) => {
      toast.show(words('admin.reset.done', { everything, name: house.name }));
      void queryClient.invalidateQueries();
      setOpen(null);
    },
  });
  if (!may) return <Meta style={styles.words}>{words('admin.houses.readOnly')}</Meta>;
  const named = namesHouse(typed, house.name);
  const everything = open === 'everything';
  function ask(which: 'history' | 'everything' | 'delete') {
    setReason('');
    setTyped('');
    setTell(true);
    remove.reset();
    restart.reset();
    setOpen(which);
  }
  return (
    <>
      <DangerZone testID="house-danger">
        {(['history', 'everything'] as const).map((which) => (
          <DangerRow
            key={which}
            title={words('house.reset.title', { everything: which === 'everything' })}
            meta={words('admin.reset.gone', { everything: which === 'everything', people: house.people.length })}
            action={words('house.reset.button')}
            icon={RotateCcwIcon}
            onPress={() => ask(which)}
            testID={`house-reset-${which}`}
          />
        ))}
        <DangerRow
          title={words('admin.deleteHouse.button')}
          meta={words('admin.deleteHouse.rowMeta')}
          action={words('admin.deleteHouse.button')}
          icon={Trash2Icon}
          onPress={() => ask('delete')}
          testID="house-delete"
        />
      </DangerZone>
      <Sheet
        visible={open === 'history' || open === 'everything'}
        title={words('admin.reset.title', { everything, name: house.name })}
        description={words('admin.reset.body', { everything })}
        onClose={() => setOpen(null)}
        testID="house-reset-sheet"
      >
        <Field label={words('admin.reset.reason')} value={reason} onChangeText={setReason} maxLength={500} testID="house-reset-reason" />
        <Field label={words('admin.reset.confirm')} value={typed} onChangeText={setTyped} placeholder={house.name} testID="house-reset-name" />
        {restart.error ? <Alert message={restart.error.message} /> : null}
        <ButtonRow stacked>
          <Button
            variant="hazard"
            icon={RotateCcwIcon}
            label={words('admin.reset.go')}
            busyLabel={words('admin.reset.going')}
            disabled={!named}
            busy={restart.isPending}
            onPress={() => restart.mutate(everything)}
            testID="house-reset-confirm"
          />
          <Button variant="outline" label={words('common.shell.cancel')} onPress={() => setOpen(null)} testID="house-reset-cancel" />
        </ButtonRow>
      </Sheet>
      <Sheet
        visible={open === 'delete'}
        title={words('admin.deleteHouse.title', { name: house.name })}
        description={words('admin.deleteHouse.body')}
        onClose={() => setOpen(null)}
        testID="house-delete-sheet"
      >
        <Field label={words('admin.deleteHouse.reason')} value={reason} onChangeText={setReason} maxLength={500} testID="house-delete-reason" />
        <ChoiceRow role="checkbox" leading={<RowIcon icon={MegaphoneIcon} />} label={words('admin.deleteHouse.tell')} checked={tell} onPress={() => setTell(!tell)} testID="house-delete-tell" />
        <Field label={words('admin.deleteHouse.confirm')} value={typed} onChangeText={setTyped} placeholder={house.name} testID="house-delete-name" />
        {remove.error ? <Alert message={remove.error.message} /> : null}
        <ButtonRow stacked>
          <Button
            variant="hazard"
            label={words('admin.deleteHouse.delete')}
            busyLabel={words('admin.deleteHouse.deleting')}
            disabled={!named}
            busy={remove.isPending}
            onPress={() => remove.mutate()}
            testID="house-delete-confirm"
          />
          <Button variant="outline" label={words('common.shell.cancel')} onPress={() => setOpen(null)} testID="house-delete-cancel" />
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
