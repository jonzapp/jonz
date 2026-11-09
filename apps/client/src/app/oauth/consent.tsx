import { CONSENT_COPY, consentPath } from '@app/core';
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
import { Reading } from '@/components/read-state';
import { SignInPanel } from '@/components/sign-in-panel';
import { Meta } from '@/components/text';
import { useMembership } from '@/hooks/use-membership';
import { SPACE } from '@/theme';

/**
 * jonz.app/oauth/consent?authorization_id=…: where Supabase's OAuth server
 * sends someone an app (an MCP client) wants to sign in as. Open to anyone,
 * signing in in place. Signed in: the app's name and site, what it will be
 * able to do (what you can, as you, with anything that can't be undone still
 * waiting for your approval here), and Allow or Don't allow, each going back
 * to the app. An app you've already allowed goes straight back.
 */
export default function Consent() {
  const { authorization_id: authorizationId = '', error } = useLocalSearchParams<{ authorization_id?: string; error?: string }>();
  const { session } = useMembership();
  const [allowing, setAllowing] = useState<boolean | null>(null);
  const read = useQuery({
    queryKey: ['oauth-consent', authorizationId, session?.user.id ?? null],
    queryFn: () => readConsent(authorizationId),
    enabled: Boolean(session && authorizationId),
    retry: false,
  });
  const answer = useMutation({
    mutationFn: (allow: boolean) => {
      setAllowing(allow);
      return answerConsent(authorizationId, allow);
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
        <PageTitle page={CONSENT_COPY.page} />
        <SignInPanel next={consentPath(authorizationId)} failed={Boolean(error)} />
      </Door>
    );
  }

  const details = read.data?.kind === 'ask' ? read.data.details : null;
  return (
    <Door testID="consent-screen">
      <PageTitle page={CONSENT_COPY.page} />
      {!authorizationId || read.isError ? (
        <Sign testID="consent-gone">
          <SignHeading title={CONSENT_COPY.gone} body={CONSENT_COPY.goneBody} />
          <Button href="/" variant="outline" label={CONSENT_COPY.goHome} />
        </Sign>
      ) : !details ? (
        <Reading />
      ) : (
        <Sign testID="consent-ask">
          <SignHeading title={CONSENT_COPY.heading(details.client.name)} body={CONSENT_COPY.body(details.client.name)} />
          <View style={styles.group}>
            {details.client.uri ? <Meta>{CONSENT_COPY.website(details.client.uri)}</Meta> : null}
            <Meta>{CONSENT_COPY.backTo(details.redirect_uri)}</Meta>
            {details.user.email ? <Meta>{CONSENT_COPY.signedInAs(details.user.email)}</Meta> : null}
          </View>
          {answer.error ? <Alert message={answer.error.message} /> : null}
          <ButtonRow>
            <Button
              label={answer.isPending && allowing === true ? CONSENT_COPY.allowing : CONSENT_COPY.allow}
              onPress={() => answer.mutate(true)}
              disabled={answer.isPending || answer.isSuccess}
              testID="consent-allow"
            />
            <Button
              label={answer.isPending && allowing === false ? CONSENT_COPY.denying : CONSENT_COPY.deny}
              variant="outline"
              onPress={() => answer.mutate(false)}
              disabled={answer.isPending || answer.isSuccess}
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
