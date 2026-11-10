import { Redirect, useLocalSearchParams } from 'expo-router';

/** All sent joined Messages on 10 Nov (list first): an old link lands there, keeping its search. */
export default function SentPage() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/admin/messages', params } as never} />;
}
