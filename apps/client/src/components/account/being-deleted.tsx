import { DELETE_COPY, deletionDay, type DeletionStatus } from '@app/core';
import { useState } from 'react';

import { keepAccount } from '@/api/account';
import { signOut } from '@/api/auth';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { useMembership } from '@/hooks/use-membership';
import { useWords } from '@/hooks/use-words';

/**
 * The whole app while an account waits to be deleted: when it goes, and
 * that nothing has gone yet; Keep my account (the one amber button) stops
 * it and opens the app again, and Sign out leaves it to go. Signing in
 * during the 30 days lands here, wherever the link was to.
 */
export function BeingDeleted({ deletion }: { deletion: DeletionStatus }) {
  const words = useWords();
  const { house, refresh } = useMembership();
  const [waiting, setWaiting] = useState<'keep' | 'out' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function keep() {
    setWaiting('keep');
    setProblem(null);
    try {
      await keepAccount();
      await refresh();
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
      setWaiting(null);
    }
  }

  async function out() {
    setWaiting('out');
    try {
      await signOut();
    } catch (reason) {
      console.warn('Sign out failed', reason);
      setWaiting(null);
    }
  }

  const body = `${DELETE_COPY.goesOn(deletionDay(deletion.deleteAfter))} ${house ? DELETE_COPY.nothingGone : DELETE_COPY.nothingGoneNoHouse}`;
  return (
    <Door home testID="being-deleted">
      <PageTitle page={words('common.title.deleteAccount')} />
      <Sign>
        <SignHeading title={DELETE_COPY.beingDeleted} body={body} />
        {problem ? <Alert message={problem} /> : null}
        {/* Not one row, so each holds still while the other waits. */}
        <Button
          label={DELETE_COPY.keep}
          busy={waiting === 'keep'}
          busyLabel={words('common.busy.keeping')}
          disabled={waiting === 'out'}
          onPress={() => void keep()}
          testID="keep-account"
        />
        <Button
          variant="outline"
          label={DELETE_COPY.signOut}
          busy={waiting === 'out'}
          busyLabel={words('common.busy.signingOut')}
          disabled={waiting === 'keep'}
          onPress={() => void out()}
          testID="deleted-sign-out"
        />
      </Sign>
    </Door>
  );
}
