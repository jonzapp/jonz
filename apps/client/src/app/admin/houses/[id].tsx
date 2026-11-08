import { HOUSES_COPY } from '@app/core';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { HousePanel } from '@/components/admin/house-panel';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { COLUMNS_MIN, RAIL } from '@/theme';

/** One house on a phone: the Houses side panel as a page of its own. */
export default function HousePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // On a laptop it opens beside the list, so the page never sits in one column with the room blank beside it.
  const laptop = useWindowDimensions().width - RAIL >= COLUMNS_MIN;
  if (laptop) return <Redirect href={{ pathname: '/admin/houses', params: { open: id } }} />;
  return (
    <Screen bar={<TitleBar title={HOUSES_COPY.page} back="/admin/houses" backLabel={HOUSES_COPY.page} />} testID="admin-house">
      <HousePanel id={id} />
    </Screen>
  );
}
