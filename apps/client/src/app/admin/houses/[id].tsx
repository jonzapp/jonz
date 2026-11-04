import { HOUSES_COPY } from '@app/core';
import { useLocalSearchParams } from 'expo-router';

import { HousePanel } from '@/components/admin/house-panel';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';

/** One house on a phone: the Houses side panel as a page of its own. */
export default function HousePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen bar={<TitleBar title={HOUSES_COPY.page} back="/admin/houses" backLabel={HOUSES_COPY.page} />} testID="admin-house">
      <HousePanel id={id} />
    </Screen>
  );
}
