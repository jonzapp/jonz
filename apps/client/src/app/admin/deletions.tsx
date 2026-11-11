import { type Words, daysUntil, DELETION_FACETS, DELETION_WHEN, deletionDay, type PendingDeletion } from '@app/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailIcon, UserXIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { deleteByEmail, deleteNow, deletionFilter, deletionsCount, deletionsPage, stopDeletion, type DeletionCursor } from '@/api/owner';
import { ownerZone } from '@/components/admin/audit-entry';
import { BusyListView, useBusyList, type BusyList } from '@/components/admin/busy-list';
import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field } from '@/components/field';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Sheet } from '@/components/sheet';
import { Lead, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TitleBar } from '@/components/title-bar';
import { useToast } from '@/components/toast';
import { useNow } from '@/hooks/use-now';
import { SPACE, TABULAR, useTheme } from '@/theme';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { AdminSwitch } from '@/components/admin/admin-shell';
import { useWords } from '@/hooks/use-words';

const KEY = ['owner-deletions'];

/** Deletions' columns on a laptop. */
const DELETION_TABLE = (words: Words): readonly ListColumn[] => [
  { key: 'name', label: words('admin.deletions.name'), width: 132 },
  { key: 'email', label: words('admin.deletions.email'), flex: 1 },
  { key: 'house', label: words('admin.deletions.house'), width: 112 },
  { key: 'asked', label: words('admin.deletions.asked'), width: 92 },
  { key: 'goes', label: words('admin.deletions.goes'), width: 92, end: true },
];

/**
 * Everyone waiting to be deleted, soonest first, as busy as the list gets:
 * the one search box finds a name, email, house or account id, and filters
 * by who started it, how soon it goes and when they asked; the database
 * does the narrowing, 50 at a time as you scroll. Tapping one opens what can
 * be done: Delete now, when they've asked for it sooner, or Stop, when
 * they've changed their mind by email; each with a reason for the audit
 * log. Over the list, starting the 30 days for someone who emailed and
 * can't sign in. Every move writes the audit log, in the database.
 */
export default function DeletionsPage() {
  const busy = useBusyList({
    key: KEY,
    facets: DELETION_FACETS,
    when: DELETION_WHEN,
    rows: (cursor: DeletionCursor | null, ask) =>
      deletionsPage(cursor, deletionFilter(ask)).then((page) => ({ items: page.people, more: page.more, next: page.next })),
    count: (ask) => deletionsCount(deletionFilter(ask)),
  });
  return (
    <Screen spreads bar={<TitleBar title="Deletions" />} onNearEnd={busy.onNearEnd} testID="admin-deletions">
      <AdminSwitch page="deletions" />
      <Deletions busy={busy} />
    </Screen>
  );
}

function Deletions({ busy }: { busy: BusyList<PendingDeletion> }) {
  const words = useWords();
  const two = useColumns();
  const now = useNow();
  const [chosen, setChosen] = useState<PendingDeletion | null>(null);
  const [byEmail, setByEmail] = useState(false);
  // Someone whose app role can't run deletions (support) sees the list, with nothing to open.
  const may = useOwnerMay('deletions:write');
  const choose = may ? setChosen : undefined;
  const list = (
    <>
      {/* On a laptop the side panel starts one by email, until someone is chosen. */}
      {two || !may ? null : (
        <Group>
          <Row leading={<RowIcon icon={MailIcon} />} title={words('admin.shell.byEmail')} onPress={() => setByEmail(true)} chevron testID="delete-by-email" />
        </Group>
      )}
      <BusyListView
        busy={busy}
        name="deletions"
        placeholder={words('admin.deletions.searchPlaceholder')}
        noun={(count: string) => words('admin.deletions.count', { count })}
        columns={DELETION_TABLE(words)}
        tableRow={(person) => {
          const cells = {
            name: person.name,
            email: person.email ?? '–',
            house: person.house ?? words('admin.deletions.noHouse'),
            asked: deletionDay(person.requestedAt, words, ownerZone()),
            goes: words('admin.deletions.goesShort', { days: Math.max(0, daysUntil(person.deleteAfter, now)) }),
          };
          return (
            <ListTableRow
              key={person.userId}
              columns={DELETION_TABLE(words)}
              cells={cells}
              quiet={['email', 'house', 'asked']}
              strong={['name']}
              chosen={chosen?.userId === person.userId}
              onPress={choose ? () => choose(person) : undefined}
              accessibilityLabel={[
                person.name,
                cells.email,
                cells.house,
                person.requestedBy === 'owner' ? words('admin.deletions.byYou') : words('admin.deletions.inTheApp'),
                `${words('admin.deletions.asked')} ${cells.asked}`,
                words('admin.shell.goesIn', { days: Math.max(0, daysUntil(person.deleteAfter, now)) }),
              ].join(', ')}
              testID={`deletion-${person.userId}`}
            />
          );
        }}
        row={(person) => (
          <Row
            key={person.userId}
            leading={<Avatar name={person.name} userId={person.userId} />}
            title={person.name}
            // The email on a line of its own, so a long one is cut at its end rather than broken in two.
            meta={[
              person.email,
              `${person.house ?? words('admin.shell.noHouse')}, ${person.requestedBy === 'owner' ? words('admin.shell.startedByYou') : words('admin.shell.askedInApp')}`,
            ]
              .filter(Boolean)
              .join('\n')}
            metaLines={2}
            trailing={<Left iso={person.deleteAfter} now={now} />}
            onPress={choose ? () => choose(person) : undefined}
            chevron={may}
            testID={`deletion-${person.userId}`}
          />
        )}
        empty={{ icon: UserXIcon, title: words('admin.shell.noDeletions'), body: words('admin.shell.noDeletionsBody') }}
      />
    </>
  );
  if (!may) return list;
  if (two) {
    return (
      <Columns
        main={list}
        side={
          chosen ? (
            <ChosenSheet key={chosen.userId} person={chosen} inline onClose={() => setChosen(null)} />
          ) : (
            <ByEmailSheet visible inline onClose={() => undefined} />
          )
        }
      />
    );
  }
  return (
    <>
      {list}
      <ChosenSheet key={chosen?.userId ?? 'none'} person={chosen} onClose={() => setChosen(null)} />
      <ByEmailSheet visible={byEmail} onClose={() => setByEmail(false)} />
    </>
  );
}

/** A sheet on a phone; on a laptop the same, in the side panel under its title. */
function Holder({
  inline,
  visible,
  title,
  description,
  onClose,
  testID,
  children,
}: {
  inline: boolean;
  visible: boolean;
  title: string;
  description: string;
  onClose: () => void;
  testID: string;
  children: ReactNode;
}) {
  if (!inline) {
    return (
      <Sheet visible={visible} title={title} description={description} onClose={onClose} testID={testID}>
        {children}
      </Sheet>
    );
  }
  return (
    <View style={styles.side} testID={testID}>
      <View style={styles.head}>
        <Lead header>{title}</Lead>
        <Meta>{description}</Meta>
      </View>
      {children}
    </View>
  );
}

/** How long is left, at the row's end. */
function Left({ iso, now }: { iso: string; now: Date }) {
  const words = useWords();
  const { type, colors } = useTheme();
  return <Text style={[type.meta, TABULAR, { color: colors.mutedForeground }]}>{words('admin.shell.goesIn', { days: Math.max(0, daysUntil(iso, now)) })}</Text>;
}

/** What can be done to one person's deletion: Delete now or Stop, and why. */
function ChosenSheet({ person, inline = false, onClose }: { person: PendingDeletion | null; inline?: boolean; onClose: () => void }) {
  const words = useWords();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState<'now' | 'stop' | null>(null);
  const done = (message: string) => {
    toast.show(message);
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ['owner-audit'] });
    onClose();
  };
  const now = useMutation({
    mutationFn: (userId: string) => deleteNow(userId, reason),
    onSuccess: () => done(words('admin.shell.deletingSoon')),
  });
  const stop = useMutation({
    mutationFn: (userId: string) => stopDeletion(userId, reason),
    onSuccess: () => done(words('admin.shell.stopped')),
  });
  const busy = now.isPending || stop.isPending;
  const problem = now.error?.message ?? stop.error?.message ?? null;
  if (!person) return null;

  const title =
    asking === 'now' ? words('admin.shell.deleteNowAsk', { name: person.name }) : asking === 'stop' ? words('admin.shell.stopAsk', { name: person.name }) : person.name;
  const description =
    asking === 'now'
      ? words('admin.shell.deleteNowBody')
      : asking === 'stop'
        ? words('admin.shell.stopBody')
        : `${person.email ?? ''}${person.email ? ', ' : ''}${words('admin.shell.goesIn', { days: Math.max(0, daysUntil(person.deleteAfter, new Date())) }).toLowerCase()} (${deletionDay(person.deleteAfter, words)})`;
  return (
    <Holder inline={inline} visible title={title} description={description} onClose={onClose} testID="deletion-sheet">
      <Field
        label={words('admin.shell.reason')}
        value={reason}
        onChangeText={setReason}
        placeholder={words('admin.shell.reasonPlaceholder')}
        maxLength={500}
        testID="deletion-reason"
      />
      {problem ? <Alert message={problem} /> : null}
      <View style={styles.buttons}>
        {asking === null ? (
          <ButtonRow stacked>
            <Button variant="hazard" label={words('admin.shell.deleteNow')} onPress={() => setAsking('now')} testID="deletion-now" />
            <Button variant="outline" label={words('admin.shell.stop')} onPress={() => setAsking('stop')} testID="deletion-stop" />
          </ButtonRow>
        ) : (
          <ButtonRow stacked>
            <Button
              variant={asking === 'now' ? 'hazard' : 'primary'}
              label={asking === 'now' ? words('admin.shell.deleteNow') : words('admin.shell.stop')}
              busy={busy}
              busyLabel={asking === 'now' ? words('common.busy.deleting') : words('common.busy.stopping')}
              onPress={() => (asking === 'now' ? now : stop).mutate(person.userId)}
              testID="deletion-confirm"
            />
            <Button variant="outline" label={words('common.shell.cancel')} onPress={() => setAsking(null)} testID="deletion-cancel" />
          </ButtonRow>
        )}
        {inline && asking === null ? <TextButton label={words('common.shell.close')} onPress={onClose} testID="deletion-close" /> : null}
      </View>
    </Holder>
  );
}

/** Start the 30 days for someone who emailed and can't sign in. */
function ByEmailSheet({ visible, inline = false, onClose }: { visible: boolean; inline?: boolean; onClose: () => void }) {
  const words = useWords();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const start = useMutation({
    mutationFn: () => deleteByEmail(email, reason),
    onSuccess: () => {
      toast.show(words('admin.shell.started'));
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['owner-audit'] });
      setEmail('');
      setReason('');
      onClose();
    },
  });
  return (
    <Holder
      inline={inline}
      visible={visible}
      title={words('admin.shell.byEmail')}
      description={words('admin.shell.byEmailBody')}
      onClose={onClose}
      testID="by-email-sheet"
    >
      <Field
        label={words('admin.shell.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        testID="deletion-email"
      />
      <Field
        label={words('admin.shell.reason')}
        value={reason}
        onChangeText={setReason}
        placeholder={words('admin.shell.reasonPlaceholder')}
        maxLength={500}
        testID="deletion-email-reason"
      />
      {start.error ? <Alert message={start.error.message} /> : null}
      <Button
        label={words('admin.shell.startDeleting')}
        disabled={!email.includes('@')}
        busy={start.isPending}
        busyLabel={words('common.busy.starting')}
        onPress={() => start.mutate()}
        testID="deletion-start"
      />
    </Holder>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: SPACE.sm },
  side: { gap: SPACE.lg },
  head: { gap: SPACE.xs },
});
