import type { AskResetAudience, HouseDetail } from '@app/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcwIcon, SparklesIcon } from 'lucide-react-native';
import { useState } from 'react';

import { ownerResetAsk } from '@/api/houses';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { useWords } from '@/hooks/use-words';

/**
 * A house's Ask Jonz section on the owner's house panel (ask_usage:write):
 * one row that opens the reset sheet. Nothing for anyone else.
 */
export function AskResetSection({ house }: { house: HouseDetail }) {
  const words = useWords();
  const may = useOwnerMay('ask_usage:write');
  const [open, setOpen] = useState(false);
  if (!may) return null;
  return (
    <>
      <Section label={words('admin.askReset.section')}>
        <Row
          leading={<RowIcon icon={SparklesIcon} />}
          title={words('admin.askReset.row')}
          meta={words('admin.askReset.rowMeta')}
          metaLines={2}
          onPress={() => setOpen(true)}
          chevron
          testID="ask-reset-open"
        />
      </Section>
      {open ? <AskResetSheet house={house} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Whose Ask Jonz starts again: everyone in this house, the people ticked
 * here, or everyone in Jonz; and why, for the audit log. Their turns so far
 * stop counting toward every limit; nothing is deleted and nobody is told.
 */
function AskResetSheet({ house, onClose }: { house: HouseDetail; onClose: () => void }) {
  const words = useWords();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<AskResetAudience>('house');
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [reason, setReason] = useState('');
  const reset = useMutation({
    mutationFn: () => ownerResetAsk({ audience, houseId: house.id, people: picked, reason }),
    onSuccess: (done) => {
      toast.show(words('admin.askReset.done', { turns: done.turns, people: done.people }));
      void queryClient.invalidateQueries();
      onClose();
    },
  });
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  const choice = (value: AskResetAudience, label: string) => (
    <ChoiceRow role="radio" label={label} checked={audience === value} onPress={() => setAudience(value)} testID={`ask-reset-${value}`} />
  );
  return (
    <Sheet visible title={words('admin.askReset.title')} description={words('admin.askReset.body')} onClose={onClose} testID="ask-reset-sheet">
      {choice('house', words('admin.askReset.house', { name: house.name }))}
      {choice('people', words('admin.askReset.people'))}
      {audience === 'people'
        ? house.people.map((person) => (
            <ChoiceRow
              key={person.id}
              role="checkbox"
              leading={<Avatar name={person.name} userId={person.id} />}
              label={person.name}
              checked={picked.includes(person.id)}
              onPress={() => toggle(person.id)}
              testID={`ask-reset-person-${person.id}`}
            />
          ))
        : null}
      {choice('everyone', words('admin.askReset.everyone'))}
      <Field label={words('admin.askReset.reason')} value={reason} onChangeText={setReason} maxLength={500} testID="ask-reset-reason" />
      {reset.error ? <Alert message={reset.error.message} /> : null}
      <ButtonRow stacked>
        <Button
          icon={RotateCcwIcon}
          label={words('admin.askReset.go', { audience })}
          busyLabel={words('admin.askReset.going')}
          disabled={audience === 'people' && picked.length === 0}
          busy={reset.isPending}
          onPress={() => reset.mutate()}
          testID="ask-reset-confirm"
        />
        <Button variant="outline" label={words('common.shell.cancel')} onPress={onClose} testID="ask-reset-cancel" />
      </ButtonRow>
    </Sheet>
  );
}
