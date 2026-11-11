import { type MessageAudience } from '@app/core';
import { useQuery } from '@tanstack/react-query';
import { HouseIcon, MegaphoneIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { findHouses, findPeople } from '@/api/messages';
import { Avatar } from '@/components/avatar';
import { Field, FieldLabel } from '@/components/field';
import { Group } from '@/components/group';
import { Row, RowIcon } from '@/components/row';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { SignMark } from '@/components/wordmark';
import { FONT, GROUP_RADIUS, INSET, SPACE, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** Who a message goes to, once picked: a person or a house, with the line under it. */
export interface Picked {
  id: string;
  name: string;
  line: string;
}

/** What was typed, once typing stops for a moment. */
function useSettled(text: string, ms = 250): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(text), ms);
    return () => clearTimeout(timer);
  }, [text, ms]);
  return settled;
}

/**
 * Picking the person or house a message goes to: a search box, the first
 * eight that match as rows, and once one is picked, that one with Change.
 * The database does the finding (owner_people_find, owner_houses_find).
 */
export function RecipientPicker({
  audience,
  picked,
  onPick,
  problem,
}: {
  audience: Exclude<MessageAudience, 'everyone'>;
  picked: Picked | null;
  onPick: (picked: Picked | null) => void;
  problem?: string;
}) {
  const words = useWords();
  const [q, setQ] = useState('');
  const settled = useSettled(q).trim();
  const found = useQuery({
    queryKey: ['owner-find', audience, settled],
    queryFn: async (): Promise<Picked[]> =>
      audience === 'person'
        ? (await findPeople(settled)).map((p) => ({
            id: p.id,
            name: p.name,
            line: [p.email, p.houseName ?? words('admin.messages.noHouse')].filter(Boolean).join(', '),
          }))
        : (await findHouses(settled)).map((h) => ({ id: h.id, name: h.name, line: h.people === 1 ? '1 person' : `${h.people} people` })),
    enabled: settled.length > 0 && picked === null,
    staleTime: 30_000,
  });
  const label = audience === 'person' ? words('admin.messages.whichPerson') : words('admin.messages.whichHouse');

  if (picked) {
    return (
      <View style={styles.group}>
        <FieldLabel>{label}</FieldLabel>
        <Group>
          <Row
            title={picked.name}
            meta={picked.line}
            leading={audience === 'person' ? <Avatar name={picked.name} userId={picked.id} /> : <RowIcon icon={HouseIcon} />}
            trailing={<TextButton label={words('admin.messages.change')} onPress={() => onPick(null)} testID="message-change-who" />}
            testID="message-picked"
          />
        </Group>
      </View>
    );
  }
  return (
    <View style={styles.group}>
      <Field
        label={label}
        value={q}
        onChangeText={setQ}
        placeholder={audience === 'person' ? words('admin.messages.findPerson') : words('admin.messages.findHouse')}
        autoCapitalize="none"
        autoCorrect={false}
        problem={problem}
        testID="message-find"
      />
      {settled && found.data ? (
        found.data.length === 0 ? (
          <Meta>{audience === 'person' ? words('admin.messages.noneFound') : words('admin.messages.noHouseFound')}</Meta>
        ) : (
          <Group testID="message-found">
            {found.data.map((one) => (
              <Row
                key={one.id}
                title={one.name}
                meta={one.line}
                leading={audience === 'person' ? <Avatar name={one.name} userId={one.id} /> : <RowIcon icon={HouseIcon} />}
                onPress={() => {
                  onPick(one);
                  setQ('');
                }}
                testID={`message-found-${one.id}`}
              />
            ))}
          </Group>
        )
      ) : null}
    </View>
  );
}

/**
 * How the message looks where it lands: as a push on a lock screen, or as
 * a post on the Wall, From Jonz. Only the ways it's going are offered.
 */
export function MessagePreview({ subject, body, push, wall }: { subject: string; body: string; push: boolean; wall: boolean }) {
  const words = useWords();
  const [view, setView] = useState<'push' | 'wall'>('push');
  const showing = push && wall ? view : wall ? 'wall' : 'push';
  const title = subject.trim() || words('admin.messages.subject');
  const text = body.trim() || words('admin.messages.body');
  return (
    <View style={styles.group} testID="message-preview">
      {push && wall ? (
        <Segmented
          label={words('admin.messages.howItLooks')}
          options={[
            { value: 'push', label: words('admin.messages.previewPush') },
            { value: 'wall', label: words('admin.messages.previewWall') },
          ]}
          value={showing}
          onChange={setView}
          equal
        />
      ) : null}
      {showing === 'push' ? <PushPreview title={title} body={text} /> : <WallPreview title={title} body={text} />}
    </View>
  );
}

/** A push as a phone's lock screen shows it: the J, Jonz, the subject and the start of the words. */
function PushPreview({ title, body }: { title: string; body: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={[styles.lock, { backgroundColor: colors.foreground }]} aria-hidden={false}>
      <View style={[styles.push, { backgroundColor: colors.card }]}>
        <SignMark size={32} />
        <View style={styles.words}>
          <Text numberOfLines={1} style={[type.body, { color: colors.foreground, fontFamily: FONT.bold }]}>
            {title}
          </Text>
          <Text numberOfLines={3} style={[type.meta, { color: colors.foreground }]}>
            {body}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** A post on the Wall, as housemates see it: From Jonz, the subject, the words. */
function WallPreview({ title, body }: { title: string; body: string }) {
  const words = useWords();
  return (
    <Group>
      <Row title={title} meta={`${words('admin.messages.fromJonz')}, ${body}`} metaLines={2} titleLines={2} leading={<RowIcon icon={MegaphoneIcon} />} />
    </Group>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
  lock: { borderRadius: GROUP_RADIUS * 2, padding: SPACE.md, paddingTop: SPACE.xxl },
  push: { borderRadius: GROUP_RADIUS, padding: INSET, flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  words: { flex: 1, minWidth: 0, gap: SPACE.xs },
});
