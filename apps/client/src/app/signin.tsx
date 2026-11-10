import { useLocalSearchParams } from 'expo-router';

import { Door } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { SignInPanel } from '@/components/sign-in-panel';
import { useWords } from '@/hooks/use-words';

/**
 * Sign in. Once a session exists the root layout's guard moves on by itself:
 * to Today, or to starting or joining a house. `?next=` is the front door's
 * choice, said under the heading and followed by the guard once you're in;
 * the web's Google redirect comes back here still carrying it, so a refusal
 * is said here and the choice isn't lost.
 */
export default function SignIn() {
  const words = useWords();
  // The web build comes back here from Google; a failure arrives as ?error=.
  const { error, next } = useLocalSearchParams<{ error?: string; next?: string | string[] }>();
  return (
    <Door testID="signin-screen">
      <PageTitle page={words('common.title.signIn')} />
      <SignInPanel next={typeof next === 'string' ? next : undefined} failed={Boolean(error)} />
    </Door>
  );
}
