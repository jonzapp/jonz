import { approvalAsk, approvalDetails, approvalState, approvePath, type ApprovalRow } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { answerApproval, readApproval } from '@/api/approvals';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { ReadFailed } from '@/components/read-state';
import { SignInPanel } from '@/components/sign-in-panel';
import { Body, Meta } from '@/components/text';
import { useMembership } from '@/hooks/use-membership';
import { SPACE } from '@/theme';
import { Waiting } from '@/components/waiting';
import { DoorOutline } from '@/components/page-outlines';
import { useWords } from '@/hooks/use-words';

/**
 * jonz.app/approve/<id>: an app the person connected to Jonz (over MCP)
 * asked to do something that can't be undone, and Jonz is holding it. Open
 * to anyone, like a join link: signed out, it signs you in here. Signed in,
 * what the app asked, in the registry's words, with Approve and Decline. The
 * app's retry then goes ahead, once; nothing else can approve it.
 */
export default function Approve() {
  const words = useWords();
  const { approvalId, error } = useLocalSearchParams<{ approvalId: string; error?: string }>();
  const { session } = useMembership();
  const read = useQuery({
    queryKey: ['approval', approvalId, session?.user.id ?? null],
    queryFn: () => readApproval(approvalId),
    enabled: Boolean(session),
  });

  return (
    <Door testID="approve-screen">
      <PageTitle page={words('people.approve.page')} />
      {!session ? (
        <SignInPanel next={approvePath(approvalId)} failed={Boolean(error)} />
      ) : read.isPending ? (
        <Waiting ready={false} outline={<DoorOutline />} />
      ) : read.isError ? (
        <Sign>
          <SignHeading title={words('people.approve.page')} />
          <ReadFailed onRetry={() => void read.refetch()} />
        </Sign>
      ) : read.data === null ? (
        <Sign testID="approve-unknown">
          <SignHeading title={words('people.approve.unknown')} body={words('people.approve.unknownBody')} />
          <Button href="/" variant="outline" label={words('people.approve.goHome')} />
          {session.user.email ? <Meta>{words('people.approve.signedInAs', { email: session.user.email })}</Meta> : null}
        </Sign>
      ) : (
        <Request row={read.data} />
      )}
    </Door>
  );
}

const ENDED = {
  approved: ['people.approve.approved', 'people.approve.approvedBody'],
  done: ['people.approve.done', 'people.approve.doneBody'],
  declined: ['people.approve.declined', 'people.approve.declinedBody'],
  expired: ['people.approve.expired', 'people.approve.expiredBody'],
} as const;

function Request({ row }: { row: ApprovalRow }) {
  const words = useWords();
  const queryClient = useQueryClient();
  // The page's own clock, read once: whether the request is still waiting.
  const [now] = useState(() => new Date());
  const [answer, setAnswer] = useState<boolean | null>(null);
  const answering = useMutation({
    mutationFn: (approve: boolean) => {
      setAnswer(approve);
      return answerApproval(row.id, approve);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', row.id] }),
  });
  const state = approvalState(row, now);
  const details = approvalDetails(row);

  return (
    <Sign testID={`approve-${state}`}>
      {state === 'waiting' ? (
        <SignHeading title={words('people.approve.heading')} body={words('people.approve.body')} />
      ) : (
        <SignHeading title={words(ENDED[state][0])} body={words(ENDED[state][1])} />
      )}
      <View style={styles.group}>
        <Body testID="approve-ask">{approvalAsk(row)}.</Body>
        {row.house_name ? <Meta>{words('people.approve.inHouse', { house: row.house_name })}</Meta> : null}
        {details.map((d) => (
          <Meta key={d.label}>
            {d.label}: {d.value}
          </Meta>
        ))}
      </View>
      {state === 'waiting' ? (
        <View style={styles.group}>
          {answering.error ? <Alert message={answering.error.message} /> : null}
          <ButtonRow>
            <Button
              label={words('people.approve.approve')}
              busy={answering.isPending && answer === true}
              busyLabel={words('people.approve.approving')}
              onPress={() => answering.mutate(true)}
              testID="approve-yes"
            />
            <Button
              label={words('people.approve.decline')}
              busy={answering.isPending && answer === false}
              busyLabel={words('people.approve.declining')}
              variant="outline"
              onPress={() => answering.mutate(false)}
              testID="approve-no"
            />
          </ButtonRow>
        </View>
      ) : (
        <Button href="/" variant="outline" label={words('people.approve.goHome')} />
      )}
    </Sign>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.sm },
});
