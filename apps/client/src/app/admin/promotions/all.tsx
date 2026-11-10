import { Redirect, useLocalSearchParams } from 'expo-router';

/** All promotions joined Promotions on 10 Nov (list first): an old link lands there, keeping its search. */
export default function AllPromotionsPage() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/admin/promotions', params } as never} />;
}
