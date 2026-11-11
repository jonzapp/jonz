import { Redirect, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { HousePanel } from '@/components/admin/house-panel';
import { Screen } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { COLUMNS_MIN, RAIL } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** One house on a phone: the Houses side panel as a page of its own. */
export default function HousePage() {
  const words = useWords();
  const { id } = useLocalSearchParams<{ id: string }>();
  // On a laptop it opens beside the list, so the page never sits in one column with the room blank beside it.
  const laptop = useWindowDimensions().width - RAIL >= COLUMNS_MIN;
  if (laptop) return <Redirect href={{ pathname: '/admin/houses', params: { open: id } }} />;
  return (
    <Screen bar={<TitleBar title={words('admin.houses.page')} back="/admin/houses" backLabel={words('admin.houses.page')} />} testID="admin-house">
      <HousePanel id={id} />
    </Screen>
  );
}
