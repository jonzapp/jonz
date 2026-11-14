import { useLocalSearchParams } from 'expo-router';
import { CheckIcon, XIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Group, GroupItem } from '@/components/group';
import { IconButton } from '@/components/icon-button';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Body, Lead, Title } from '@/components/text';
import { GUTTER, PANEL, SECTION_GAP, SPACE, useTheme, WIDE } from '@/theme';

import { Buttons, Choosing, Colours, Danger, Kinds, Lists, Loading, Marks, Words } from './kit';
import { AdminListSample, HouseSample, TodayReadingSample, TodaySample, WeekSample } from './samples';

const none = () => {};

/**
 * The style page: the kit (every building block, docs/style/) and sample
 * pages made from it. On a phone, one column. From COLUMNS_MIN, the samples
 * sit in the docked side column, as Today's and Week's do, and the admin
 * list is a table in the main one, as the admin pages' are. With ?panel=1 on
 * a laptop, a side panel takes PANEL from the window's right edge, as the
 * chat with Jonz does, so the page and the panel can both be checked at
 * their narrowest.
 */
export function StyleBook() {
  const { panel } = useLocalSearchParams<{ panel?: string }>();
  const { colors } = useTheme();
  const width = useWindowDimensions().width;
  const withPanel = panel === '1' && width >= WIDE;
  return (
    <View style={[styles.window, { backgroundColor: colors.background }]} testID="style-page">
      <View style={styles.page}>
        <Screen spreads>
          <Pages />
        </Screen>
      </View>
      {withPanel ? <SidePanel /> : null}
    </View>
  );
}

function Pages() {
  const two = useColumns();
  const head = (
    <View style={styles.head}>
      <Title>House style</Title>
      <Lead>Every building block in Day and Night. The rules are in docs/style.</Lead>
    </View>
  );
  const kit = (
    <>
      <Words />
      <Colours />
      <Buttons />
      <Choosing />
      <Marks />
      <Lists />
      <Kinds />
      <Danger />
      <Loading />
    </>
  );
  const samples = (
    <>
      <TodaySample />
      <TodayReadingSample />
      <WeekSample />
      <HouseSample />
    </>
  );
  if (two)
    return (
      <Columns
        main={
          <>
            {head}
            <AdminListSample />
            {kit}
          </>
        }
        side={samples}
      />
    );
  return (
    <>
      {head}
      {samples}
      <AdminListSample />
      {kit}
    </>
  );
}

/** The side panel at its width: what goes in the chat with Jonz and other panels. */
function SidePanel() {
  const { colors } = useTheme();
  return (
    <View style={[styles.panel, { borderLeftColor: colors.border, backgroundColor: colors.background }]} testID="style-panel">
      <ScrollView contentContainerStyle={styles.panelPage}>
        <View style={styles.panelHead}>
          <Title>Side panel</Title>
          <IconButton icon={XIcon} label="Close" onPress={none} />
        </View>
        <Section label="In a panel" testID="panel-kit">
          <Group>
            <GroupItem>
              <Body>Jonz suggests adding Clean the fridge, every other Sunday, for whoever has the kitchen.</Body>
              <ButtonRow testID="panel-row-short">
                <Button icon={CheckIcon} label="Add it" onPress={none} />
                <Button variant="ghost" label="Not now" onPress={none} />
              </ButtonRow>
              <ButtonRow testID="panel-row-long">
                <Button variant="outline" icon={CheckIcon} label="Mark fixed" onPress={none} />
                <Button variant="outline" label="Same as earlier report" onPress={none} />
              </ButtonRow>
            </GroupItem>
          </Group>
          <Group>
            <Row title="Clean the fridge" meta="Every other Sunday" lid="kitchen" onPress={none} chevron />
            <Row title="Descale the kettle" meta="Monthly" lid="kitchen" onPress={none} chevron />
          </Group>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1, flexDirection: 'row' },
  page: { flex: 1, minWidth: 0 },
  head: { gap: SPACE.sm },
  panel: { width: PANEL, borderLeftWidth: StyleSheet.hairlineWidth },
  panelPage: { padding: GUTTER, gap: SECTION_GAP },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
