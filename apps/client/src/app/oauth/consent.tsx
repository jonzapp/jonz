import { consentPath, DEFAULT_APP_ACCESS, type AppAccess } from '@app/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { answerConsent, goBack, readConsent } from '@/api/connected-apps';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { SignInPanel } from '@/components/sign-in-panel';
import { Meta } from '@/components/text';
import { useMembership } from '@/hooks/use-membership';
import { SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { DoorOutline } from '@/components/page-outlines';
import { FieldLabel } from '@/components/field';
import { AppAccessChoice } from '@/components/house-page/app-access-choice';
import { useWords } from '@/hooks/use-words';

/**
 * jonz.app/oauth/consent?authorization_id=…: where Supabase's OAuth server
 * sends someone an app (an MCP client) wants to sign in as. Open to anyone,
 * signing in in place. Signed in: the app's name and site, what it will be
 * able to do, picked here (Read only, first, or Read and change: what you
 * can, as you, with anything that can't be undone still waiting for your
 * approval here), and Allow or Don't allow, each going back to the app.
 * Allow saves the pick before letting the app in. An app you've already
 * allowed goes straight back.
 */
export default function Consent() {
  const words = useWords();
  const { authorization_id: authorizationId = '', error } = useLocalSearchParams<{ authorization_id?: string; error?: string }>();
  const { session } = useMembership();
  const [allowing, setAllowing] = useState<boolean | null>(null);
  const [access, setAccess] = useState<AppAccess>(DEFAULT_APP_ACCESS);
  const read = useQuery({
    queryKey: ['oauth-consent', authorizationId, session?.user.id ?? null],
    queryFn: () => readConsent(authorizationId),
    enabled: Boolean(session && authorizationId),
    retry: false,
  });
  const answer = useMutation({
    mutationFn: (allow: boolean) => {
      setAllowing(allow);
      return answerConsent(authorizationId, allow && read.data?.kind === 'ask' ? { clientId: read.data.details.client.id, access } : null);
    },
    onSuccess: (url) => goBack(url),
  });
  const back = read.data?.kind === 'back' ? read.data.url : null;
  useEffect(() => {
    if (back) goBack(back);
  }, [back]);

  if (!session) {
    return (
      <Door testID="consent-screen">
        <PageTitle page={words('people.consent.page')} />
        <SignInPanel next={consentPath(authorizationId)} failed={Boolean(error)} />
      </Door>
    );
  }

  const details = read.data?.kind === 'ask' ? read.data.details : null;
  return (
    <Door testID="consent-screen">
      <PageTitle page={words('people.consent.page')} />
      {!authorizationId || read.isError ? (
        <Sign testID="consent-gone">
          <SignHeading title={words('people.consent.gone')} body={words('people.consent.goneBody')} />
          <Button href="/" variant="outline" label={words('people.consent.goHome')} />
        </Sign>
      ) : !details ? (
        <Waiting ready={false} outline={<DoorOutline />} />
      ) : (
        <Sign testID="consent-ask">
          <SignHeading title={words('people.consent.heading', { app: details.client.name })} body={words('people.consent.body', { app: details.client.name })} />
          <View style={styles.group}>
            {details.client.uri ? <Meta>{words('people.consent.website', { uri: details.client.uri })}</Meta> : null}
            <Meta>{words('people.consent.backTo', { uri: details.redirect_uri })}</Meta>
            {details.user.email ? <Meta>{words('people.consent.signedInAs', { email: details.user.email })}</Meta> : null}
          </View>
          <View style={styles.group}>
            <FieldLabel>{words('people.appAccess.label', { app: details.client.name })}</FieldLabel>
            <AppAccessChoice value={access} onChange={setAccess} inCard disabled={answer.isPending || answer.isSuccess} />
          </View>
          {answer.error ? <Alert message={answer.error.message} /> : null}
          <ButtonRow>
            <Button
              label={words('people.consent.allow')}
              busy={answer.isPending && allowing === true}
              busyLabel={words('people.consent.allowing')}
              onPress={() => answer.mutate(true)}
              disabled={answer.isSuccess}
              testID="consent-allow"
            />
            <Button
              label={words('people.consent.deny')}
              busy={answer.isPending && allowing === false}
              busyLabel={words('people.consent.denying')}
              variant="outline"
              onPress={() => answer.mutate(false)}
              disabled={answer.isSuccess}
              testID="consent-deny"
            />
          </ButtonRow>
        </Sign>
      )}
    </Door>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.xs },
});
