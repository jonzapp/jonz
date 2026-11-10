import { DELETION_DAYS, DELETE_PATH, signInPath } from '@app/core';
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
            <SignHeading title={words('people.delete.title')} />
            <DeleteAccountForm onKeep={() => router.replace('/')} />
          </>
        ) : (
          <>
            <SignHeading title={words('people.delete.pageTitle')} body={words('people.delete.pageBody', { days: DELETION_DAYS })} />
            <Body>
              <Text style={styles.lead}>{words('people.delete.goesLead')}</Text> {words('people.delete.goes')}
            </Body>
            <Body>
              <Text style={styles.lead}>{words('people.delete.staysAnyLead')}</Text> {words('people.delete.stays')}
            </Body>
            <Body>{words('people.delete.passAny')}</Body>
            <Button label={words('people.delete.signInToDelete')} icon={LogInIcon} href={signInPath(DELETE_PATH)} testID="sign-in-to-delete" />
          </>
        )}
      </Sign>
      <DoorFoot>
        <Meta>{words('people.delete.cantSignIn')}</Meta>
      </DoorFoot>
    </Door>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: FONT.bold },
});
