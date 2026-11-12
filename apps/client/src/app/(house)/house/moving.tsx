import { Redirect } from 'expo-router';

/** Moving out is under You now: an old link lands there. */
export default function OldMovingScreen() {
  return <Redirect href="/you/moving" />;
}
