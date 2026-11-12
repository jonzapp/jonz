import { Redirect } from 'expo-router';

/** You is its own tab now: an old link lands there. */
export default function OldYouScreen() {
  return <Redirect href="/you" />;
}
