import { type Words, auditChanges, auditLikeThis, auditLine, auditParts, formatWhen, listTime, type AuditEntry } from '@app/core';
import { StyleSheet, Text, View } from 'react-native';

import { ListTableRow, type ListColumn } from '@/components/admin/list-table';
import { Group, GroupItem } from '@/components/group';
import { Row } from '@/components/row';
import { Section } from '@/components/section';
import { Lead, Meta } from '@/components/text';
import { FONT, INSET, SPACE, TABULAR, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** The audit log's columns on a laptop: when, who, what happened (with its detail), and where. */
export const AUDIT_TABLE = (words: Words): readonly ListColumn[] => [
  // As narrow as "Fri 30 Oct, 21:42", "Someone else" and "Account 5b1e9c40" allow, so what happened has the room.
  { key: 'when', label: words('admin.audit.when'), width: 144 },
  { key: 'who', label: words('admin.audit.who'), width: 112 },
  { key: 'what', label: 'What happened', flex: 1 },
  { key: 'where', label: 'Where', width: 136 },
];

/** The owner's zone: an admin list's times and Today are the owner's own. */
export function ownerZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** One entry on a phone: who did what, its detail (or where) under it, and the time. No icon: a busy list needs the room. */
export function AuditRow({ entry, ownerId, now, onPress }: { entry: AuditEntry; ownerId: string | null; now: Date; onPress: () => void }) {
  const words = useWords();
  const { title, meta } = auditLine(entry, ownerId, words);
  return (
    <Row
      title={title}
      meta={meta}
      trailing={<Time text={listTime(entry.at, now, ownerZone(), false)} />}
      onPress={onPress}
      testID={`audit-row-${entry.id}`}
    />
  );
}

/** One entry on a laptop: one line across the table's columns, the time to the second. */
export function AuditTableRow({
  entry,
  ownerId,
  now,
  chosen,
  onPress,
}: {
  entry: AuditEntry;
  ownerId: string | null;
  now: Date;
  chosen: boolean;
  onPress: () => void;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const parts = auditParts(entry, ownerId, words);
  const when = listTime(entry.at, now, ownerZone());
  return (
    <ListTableRow
      columns={AUDIT_TABLE(words)}
      cells={{
        when,
        who: parts.who,
        what: (
          <Text numberOfLines={1} style={[type.body, { color: colors.foreground }]}>
            {parts.what}
            {parts.detail ? <Text style={{ color: colors.mutedForeground }}>{`  ${parts.detail}`}</Text> : null}
          </Text>
        ),
        where: parts.where,
      }}
      quiet={['when']}
      strong={['who']}
      chosen={chosen}
      onPress={onPress}
      accessibilityLabel={[when, `${parts.who} ${parts.what}`, parts.detail, parts.where].filter(Boolean).join(', ')}
      testID={`audit-row-${entry.id}`}
    />
  );
}

function Time({ text }: { text: string }) {
  const { type, colors } = useTheme();
  return <Text style={[type.meta, TABULAR, { color: colors.mutedForeground }]}>{text}</Text>;
}

/** An entry in full: when, what changed (old struck through, new in bold), and its details. */
export function AuditDetail({
  entry,
  ownerId,
  onLikeThis,
}: {
  entry: AuditEntry;
  ownerId: string | null;
  /** Show more like this: the list, narrowed the way the row chosen says. */
  onLikeThis?: (params: Record<string, string>) => void;
}) {
  const words = useWords();
  const { colors, type } = useTheme();
  const changes = auditChanges(entry);
  return (
    <View style={styles.detail} testID={`audit-detail-${entry.id}`}>
      <View style={styles.head}>
        <Meta>{`#${entry.id}, ${formatWhen(entry.at)}`}</Meta>
        <Lead header>{auditLine(entry, ownerId, words).title}</Lead>
      </View>
      {changes.length > 0 ? (
        <Section label={words('admin.shell.whatChanged')}>
          <Group>
            {changes.map((change) => (
              <GroupItem key={change.field}>
                <View style={styles.change}>
                  <Text style={[type.initials, { color: colors.mutedForeground }]}>{change.label}</Text>
                  {change.from !== null ? (
                    <Text style={[type.body, styles.was, { color: colors.mutedForeground }]}>{change.from}</Text>
                  ) : null}
                  <Text style={[type.body, styles.now, { color: colors.foreground }]}>{change.to ?? '–'}</Text>
                </View>
              </GroupItem>
            ))}
          </Group>
        </Section>
      ) : null}
      <Section label={words('admin.shell.details')}>
        <Group>
          <Row title={words('admin.shell.action')} meta={entry.action} />
          {entry.reason ? <Row title={entry.reason} /> : null}
        </Group>
      </Section>
      {onLikeThis ? (
        <Section label={words('admin.audit.likeThis')} testID="audit-like-this">
          <Group>
            {auditLikeThis(entry, ownerId, words).map((like) => (
              <Row
                key={like.label}
                title={like.label}
                meta={like.meta}
                chevron
                onPress={() => onLikeThis(like.params)}
                testID={`audit-like-${Object.keys(like.params)[0]}`}
              />
            ))}
          </Group>
        </Section>
      ) : null}
      <Meta style={styles.words}>{words('admin.shell.appendOnly')}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  detail: { gap: SPACE.xl },
  // Words on the page start where a card's do, as the section labels under them.
  head: { gap: SPACE.xs, paddingHorizontal: INSET },
  words: { paddingHorizontal: INSET },
  change: { gap: 2, paddingVertical: SPACE.md },
  was: { textDecorationLine: 'line-through' },
  now: { fontFamily: FONT.bold },
});
