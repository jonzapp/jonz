import { type Currency, CURRENCY_CHOICES, dayChoices, DOOR, FAMILY_OPEN, houseDefaults, type HouseKind, type IsoDow, kindParam, newHouseWords, timeZoneName } from '@app/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { createHouse } from '@/api/house';
import { startHouseFrom } from '@/api/moving';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Field, FieldLabel } from '@/components/field';
import { DefaultsLine } from '@/components/front-door/defaults-line';
import { Door, DoorFoot, Sign, SignHeading } from '@/components/front-door/door';
import { KindChoice } from '@/components/front-door/kind-choice';
import { PageTitle } from '@/components/page-title';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useMembership } from '@/hooks/use-membership';
import { useMovingOn } from '@/hooks/use-moving-on';
import { rememberedKind } from '@/door-kind';
import { deviceCurrency, deviceTimeZone } from '@/locale';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Starting a house: one field, its name. The rest starts from this phone
 * (its time zone and currency) and Monday, said in one line under the name
 * with "Change" to open the currency and the first day of the week. Once the
 * house exists, the root layout's guard moves on to Today.
 *
 * Above the name, "Who lives here?": housemates or a family, picked already
 * from the front door's switch (`?kind=`, or what this device remembers).
 * Until families open (FAMILY_OPEN) the question shows only to a link that
 * asks for a family.
 *
 * From the Moving on screen (`?from=` the house you left) it's your new
 * place, and the old house's John list comes with it.
 */
export default function NewHouse() {
  const words = useWords();
  const { refresh } = useMembership();
  const { from, kind: asked } = useLocalSearchParams<{ from?: string; kind?: string }>();
  const moving = useMovingOn().data ?? null;
  const copying = moving && moving.fromHouse === from && moving.johns > 0 ? moving : null;
  const [kind, setKind] = useState<HouseKind>(
    () => kindParam(asked) ?? (FAMILY_OPEN ? rememberedKind() : null) ?? 'housemates',
  );
  // A move keeps the old house's kind, so there's nothing to ask.
  const asking = !copying && (FAMILY_OPEN || kindParam(asked) === 'family');
  const sign = newHouseWords(kind, words);
  const [timezone] = useState(deviceTimeZone);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>(deviceCurrency);
  const [weekStarts, setWeekStarts] = useState<IsoDow>(1);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setProblem(null);
    try {
      const input = { name, timezone, currency, weekStarts };
      await (copying ? startHouseFrom(copying.fromHouse, input) : createHouse({ ...input, kind }));
      await refresh();
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  return (
    <Door testID="new-house-screen">
      <PageTitle page={sign.title} />
      <Sign>
        {copying ? (
          <SignHeading title={words('house.moving.newHeading')} body={words('house.moving.newIntro', { house: copying.houseName, johns: copying.johns })} />
        ) : (
          <SignHeading title={sign.heading} body={sign.intro} />
        )}
        {asking ? (
          <View style={styles.pick}>
            <FieldLabel>{words('house.family.whoLivesHere')}</FieldLabel>
            <KindChoice value={kind} onChange={setKind} />
          </View>
        ) : null}
        <View style={styles.name}>
          <Field
            label={words('door.welcome.name')}
            placeholder={words('door.newHouse.namePlaceholder')}
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => {
              if (name.trim() && !busy) void submit();
            }}
            maxLength={60}
            autoFocus
            returnKeyType="done"
            testID="house-name"
          />
          <DefaultsLine
            parts={houseDefaults({ currency, weekStarts, timezone, kind, words })}
            open={changing}
            onToggle={() => setChanging((was) => !was)}
          />
        </View>
        {changing ? (
          <View style={styles.rest} testID="house-defaults-fields">
            <View style={styles.pick}>
              <FieldLabel>{words('door.newHouse.currency')}</FieldLabel>
              <Segmented
                equal
                label={words('door.newHouse.currency')}
                options={CURRENCY_CHOICES}
                value={currency}
                onChange={setCurrency}
                testID="house-currency"
              />
            </View>
            <View style={styles.pick}>
              <FieldLabel>{words('door.newHouse.weekStarts')}</FieldLabel>
              <Segmented
                equal
                label={words('door.newHouse.weekStarts')}
                options={dayChoices(words)}
                value={weekStarts}
                onChange={setWeekStarts}
                testID="house-week-starts"
              />
            </View>
            <Meta>{words('door.welcome.zoneNote', { zone: timeZoneName(timezone) })}</Meta>
          </View>
        ) : null}
        {problem ? <Alert message={problem} /> : null}
        <Button
          label={sign.submit}
          busyLabel={words('door.newHouse.busy')}
          onPress={() => void submit()}
          busy={busy}
          disabled={!name.trim()}
          testID="create-house"
        />
      </Sign>
      <DoorFoot>
        <TextButton href={DOOR.invite} label={words('door.welcome.invite')} chevron align="start" />
      </DoorFoot>
    </Door>
  );
}

const styles = StyleSheet.create({
  // The defaults read as the field's hint, right under it.
  name: { gap: SPACE.xs },
  rest: { gap: SPACE.xl },
  // Labelled as a field is.
  pick: { gap: SPACE.sm },
});
