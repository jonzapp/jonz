import {
  APP_NAME,
  DOOR,
  FAMILY_COPY,
  FAMILY_OPEN,
  FRONT_DOOR,
  FRONT_DOOR_COPY,
  frontDoorWords,
  HOUSE_KINDS,
  type HouseKind,
  SIGN_IN,
  SIGN_IN_COPY,
  signInPath,
} from '@app/core';
import { useState } from 'react';
import { CoinsIcon, ListTodoIcon, ShuffleIcon, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button } from '@/components/button';
import { Door, DoorFoot, Sign } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { Body, Heading, Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextLink } from '@/components/text-link';
import { ButtonRow } from '@/components/button-row';
import { Segmented } from '@/components/segmented';
import { rememberedKind, rememberKind } from '@/door-kind';
import { CONTENT_MAX, LEADING, ROW_GAP, SPACE, useTheme } from '@/theme';

type Point = (typeof FRONT_DOOR_COPY.points)[number]['key'];

const ICON: Record<Point, LucideIcon> = {
  list: ListTodoIcon,
  share: ShuffleIcon,
  stake: CoinsIcon,
};

/** From this width the two ways in sit side by side. */
const SIDE_BY_SIDE = 560;

const KIND_CHOICES = HOUSE_KINDS.map((kind) => ({ value: kind, label: FAMILY_COPY.kinds[kind] }));

/**
 * The front door, signed out: the wordmark, the taped sign with the big caps
 * headline, three plain sentences, and the two ways in. Each way in goes
 * through sign-in carrying where it leads (`next`), so starting a house lands
 * on naming it, and an invite on pasting it.
 *
 * Once families are open (FAMILY_OPEN), a Housemates / Family switch sits
 * above the headline: it changes the words and which kind of house Start
 * makes, and this device remembers it for next time.
 */
export default function FrontDoor() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_BY_SIDE;
  const [kind, setKind] = useState<HouseKind>(() => (FAMILY_OPEN ? (rememberedKind() ?? 'housemates') : 'housemates'));
  const words = frontDoorWords(kind);
  const start = kind === 'family' ? DOOR.startFamily : DOOR.start;

  return (
    <Door
      home
      maxWidth={CONTENT_MAX}
      right={<TextButton href={SIGN_IN} label={FRONT_DOOR.signIn} align="end" testID="sign-in" />}
      testID="front-door"
    >
      <PageTitle />
      <Sign>
        {FAMILY_OPEN ? (
          <Segmented
            equal
            label={FAMILY_COPY.switchLabel}
            options={KIND_CHOICES}
            value={kind}
            onChange={(next) => {
              setKind(next);
              rememberKind(next);
            }}
            testID="door-kind"
          />
        ) : null}
        <Heading>{words.headline}</Heading>
        <View style={styles.points}>
          {words.points.map(({ key, body }) => {
            const Icon = ICON[key];
            return (
              <View key={key} style={styles.point}>
                <View style={styles.icon}>
                  <Icon size={24} color={colors.foreground} aria-hidden />
                </View>
                <Body style={styles.words}>{body}</Body>
              </View>
            );
          })}
        </View>
        <ButtonRow stacked={!sideBySide}>
          <Button href={signInPath(start)} label={words.start} testID="start" />
          <Button href={signInPath(DOOR.invite)} label={FRONT_DOOR_COPY.invite} variant="outline" testID="invite" />
        </ButtonRow>
      </Sign>
      <DoorFoot>
        <View style={styles.foot}>
          <Meta>{APP_NAME}</Meta>
          <TextLink href="/privacy" label={SIGN_IN_COPY.privacy} small testID="privacy" />
          <TextLink href="/terms" label={SIGN_IN_COPY.termsLink} small testID="terms" />
        </View>
      </DoorFoot>
    </Door>
  );
}

const styles = StyleSheet.create({
  points: { gap: SPACE.lg },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: ROW_GAP },
  // The icon sits on the first line's middle, in the row's leading slot.
  icon: { width: LEADING, alignItems: 'center' },
  words: { flex: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
});
