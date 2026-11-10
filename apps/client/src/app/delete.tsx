import { DELETE_COPY, DELETE_PATH, signInPath } from '@app/core';
import { router } from 'expo-router';
import { LogInIcon } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import { DeleteAccountForm } from '@/components/account/delete-account';
import { Button } from '@/components/button';
import { Door, DoorFoot, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { Body, Meta } from '@/components/text';
import { useMembership } from '@/hooks/use-membership';
import { FONT } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * jonz.app/delete, for anyone: the page Google Play links to, for someone
 * who has removed the app. Signed out, it says what goes and what stays and
 * offers sign-in, which comes back here. Signed in, it's House's Delete my
 * account. Whoever can't sign in any more is told who to email.
 */
export default function DeletePage() {
  const words = useWords();
  const { session } = useMembership();
  return (
    <Door testID="delete-page">
      <PageTitle page={words('common.title.deleteAccount')} />
      <Sign>
        {session ? (
          <>
            <SignHeading title={DELETE_COPY.title} />
            <DeleteAccountForm onKeep={() => router.replace('/')} />
          </>
        ) : (
          <>
            <SignHeading title={DELETE_COPY.pageTitle} body={DELETE_COPY.pageBody} />
            <Body>
              <Text style={styles.lead}>{DELETE_COPY.goesLead}</Text> {DELETE_COPY.goes}
            </Body>
            <Body>
              <Text style={styles.lead}>{DELETE_COPY.staysAnyLead}</Text> {DELETE_COPY.stays}
            </Body>
            <Body>{DELETE_COPY.passAny}</Body>
            <Button label={DELETE_COPY.signInToDelete} icon={LogInIcon} href={signInPath(DELETE_PATH)} testID="sign-in-to-delete" />
          </>
        )}
      </Sign>
      <DoorFoot>
        <Meta>{DELETE_COPY.cantSignIn}</Meta>
      </DoorFoot>
    </Door>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: FONT.bold },
});
