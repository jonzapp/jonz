import { Redirect } from 'expo-router';

/** Your reports are under You now: an old link lands there. */
export default function OldReportsScreen() {
  return <Redirect href="/you/reports" />;
}
