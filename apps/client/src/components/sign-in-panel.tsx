import { googleReturn, signInLine, type SignInProvider } from '@app/core';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { appleSignInAvailable, signInWithApple, signInWithGoogle, signInWithMicrosoft, type SignInResult } from '@/api/auth';
import { ON_STAGING } from '@/api/staging';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { DemoSignIn } from '@/components/demo-sign-in';
import { EmailSignIn } from '@/components/email-sign-in';
import { DoorFoot, Sign, SignHeading } from '@/components/front-door/door';
import { GoogleIcon } from '@/components/google-icon';
import { MicrosoftIcon } from '@/components/microsoft-icon';
import { Meta } from '@/components/text';
import { TextLink } from '@/components/text-link';
import { RADIUS, SPACE, TAP, useTheme } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Sign-in: Apple then Google then Microsoft on iOS, Google then Microsoft
 * elsewhere (Microsoft for Outlook, Hotmail and work accounts), then an
 * email and password (EmailSignIn), on the page's taped sign, with the small print under it. The sign-in screen is this on its
 * own; a join link shows it in place, so the code survives. `next` is where
 * signing in leads (the front door's choice, or the join link): the line
 * under the heading names it, and the web comes back from Google or
 * Microsoft carrying it (core's googleReturn). `failed` says one of them
 * already turned the web back once, which the page can't tell apart. On
 * staging, the demo house's housemates follow (DemoSignIn).
 */
export function SignInPanel({
  next,
  failed: failedBefore = false,
  reason,
}: {
  next?: string;
  failed?: boolean;
  /** The line under the heading, in place of the usual one: an invite names its house ("Sign in to join Flat 3."). */
  reason?: string;
}) {
  const words = useWords();
  const { scheme } = useTheme();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<SignInProvider | null>(null);
  const appleWaits = busy === 'Apple';
  const [failed, setFailed] = useState<SignInProvider | 'return' | null>(failedBefore ? 'return' : null);

  useEffect(() => {
    let active = true;
    appleSignInAvailable()
      .then((available) => {
        if (active) setApple(available);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function attempt(provider: SignInProvider, signIn: () => Promise<SignInResult>) {
    setBusy(provider);
    setFailed(null);
    try {
      // Redirected: the page is leaving for Google or Microsoft, so stay busy.
      if ((await signIn()) !== 'redirected') setBusy(null);
    } catch (reason) {
      console.warn(`${provider} sign-in failed`, reason);
      setFailed(provider);
      setBusy(null);
    }
  }

  return (
    <>
      <Sign testID="sign-in-panel">
        <SignHeading
          title={words('door.signIn.heading')}
          // Apple's line about which account to use still comes first.
          body={reason && !apple ? reason : signInLine(next, words, apple)}
        />

        {failed ? <Alert message={failed === 'return' ? words('door.signIn.returnFailed') : words('door.signIn.failed', { provider: failed })} /> : null}

        <View style={styles.ways}>
          {apple ? (
            // Apple's own button: its look is Apple's rule, not Bin Night's.
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={RADIUS}
              style={styles.apple}
              onPress={() => void attempt('Apple', signInWithApple)}
              testID="apple-sign-in"
            />
          ) : null}

          <ButtonRow stacked>
            <Button
              variant="outline"
              icon={GoogleIcon}
              label={words('door.signIn.google')}
              busyLabel={words('door.signIn.googleBusy')}
              busy={busy === 'Google'}
              // Apple's own button is outside the row: these hold still while it signs in.
              disabled={appleWaits}
              onPress={() => void attempt('Google', () => signInWithGoogle(googleReturn(next)))}
              testID="google-sign-in"
            />

            <Button
              variant="outline"
              icon={MicrosoftIcon}
              label={words('door.signIn.microsoft')}
              busyLabel={words('door.signIn.microsoftBusy')}
              busy={busy === 'Microsoft'}
              disabled={appleWaits}
              onPress={() => void attempt('Microsoft', () => signInWithMicrosoft(googleReturn(next)))}
              testID="microsoft-sign-in"
            />
          </ButtonRow>

          <Meta>{words('door.signIn.sameAccount')}</Meta>
        </View>

        <EmailSignIn />

        {ON_STAGING ? <DemoSignIn /> : null}
      </Sign>

      <DoorFoot>
        <Meta>{words('door.signIn.terms')}</Meta>
        <View style={styles.legal}>
          <TextLink href="/privacy" label={words('door.signIn.privacy')} small />
          <TextLink href="/terms" label={words('door.signIn.termsLink')} small />
        </View>
      </DoorFoot>
    </>
  );
}

const styles = StyleSheet.create({
  ways: { gap: SPACE.sm },
  apple: { height: TAP, width: '100%' },
  legal: { flexDirection: 'row', gap: SPACE.lg },
});
