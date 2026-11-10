import { DOOR, formatMoney, FRONT_DOOR_COPY, JOIN_COPY, joinLine, PAGE_TITLE } from '@app/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { houseByCode, invitePreview, joinHouse, type Invite, type InvitePreview } from '@/api/house';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Door, Sign, SignHeading } from '@/components/front-door/door';
import { PageTitle } from '@/components/page-title';
import { ReadFailed } from '@/components/read-state';
import { SignInPanel } from '@/components/sign-in-panel';
import { Body, Meta } from '@/components/text';
import { useMembership } from '@/hooks/use-membership';
import { Waiting } from '@/components/waiting';
import { DoorOutline } from '@/components/page-outlines';

/**
 * A join link: /join/CODE on the web, jonz://join/CODE on a phone, the same
 * path the web app's links use. Open to anyone, so the code survives signing
 * in. Signed out, it opens on the invite: the house's name on the taped sign
 * and how many live there (what the link's card in a chat already shows),
 * with one button that leads to signing in here, the house named there too.
 * A link that opens nothing says so before anyone signs in. Signed in: the
 * house's name, how many live there, what it plays for (the stake and
 * fines, so nobody joins a money game unaware), and "Join the house". A read that fails says so, with "Try
 * again". (The parameter is `joinCode`, not `code`: the web's Google redirect
 * comes back with a `?code=` of its own, and a refusal with `?error=`.)
 */
export default function Join() {
  const { joinCode, error } = useLocalSearchParams<{ joinCode: string; error?: string }>();
  const { session, house, refresh } = useMembership();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [unreadable, setUnreadable] = useState(false);
  const [reads, setReads] = useState(0);
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Signed out: the house as its link names it (null: the link opens nothing; 'none': not to be named, or unread).
  const [preview, setPreview] = useState<InvitePreview | null | 'none' | undefined>(undefined);
  // The invite's button was pressed; coming back from Google or Microsoft refused is already past it.
  const [signingIn, setSigningIn] = useState(Boolean(error));

  useEffect(() => {
    if (session) return;
    let active = true;
    void invitePreview(joinCode).then((found) => {
      if (active) setPreview(found === undefined ? 'none' : found);
    });
    return () => {
      active = false;
    };
  }, [session, joinCode]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    houseByCode(joinCode)
      .then((found) => {
        if (active) setInvite(found);
      })
      .catch(() => {
        if (active) setUnreadable(true);
      });
    return () => {
      active = false;
    };
  }, [session, joinCode, reads]);

  function readAgain() {
    setUnreadable(false);
    setInvite(undefined);
    setReads((n) => n + 1);
  }

  async function join() {
    setJoining(true);
    setProblem(null);
    try {
      await joinHouse(joinCode);
      await refresh();
      router.replace('/today');
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
      setJoining(false);
    }
  }

  return (
    <Door testID="join-screen">
      <PageTitle page={PAGE_TITLE.join} />
      {!session ? (
        preview === undefined ? (
          <Waiting ready={false} label={FRONT_DOOR_COPY.lookingUp} outline={<DoorOutline />} />
        ) : preview === null ? (
          <Sign>
            <SignHeading title={JOIN_COPY.badLink} body={JOIN_COPY.badLinkBody} />
            <ButtonRow>
              <Button href={DOOR.invite} variant="outline" label={JOIN_COPY.back} />
            </ButtonRow>
          </Sign>
        ) : preview === 'none' || signingIn ? (
          <SignInPanel
            next={`/join/${joinCode}`}
            failed={Boolean(error)}
            reason={preview === 'none' ? undefined : JOIN_COPY.signInFor(preview.name)}
          />
        ) : (
          <Sign testID="invite-first">
            <SignHeading above={JOIN_COPY.invited} title={preview.name} body={joinLine(preview.kind, preview.members)} />
            <ButtonRow>
              <Button label={FRONT_DOOR_COPY.join} onPress={() => setSigningIn(true)} testID="invite-join" />
            </ButtonRow>
            <Meta>{JOIN_COPY.nextSignIn}</Meta>
          </Sign>
        )
      ) : unreadable ? (
        <Sign>
          <SignHeading title={PAGE_TITLE.join} />
          <ReadFailed onRetry={readAgain} />
        </Sign>
      ) : invite === undefined ? (
        <Waiting ready={false} label={FRONT_DOOR_COPY.lookingUp} outline={<DoorOutline />} />
      ) : !invite ? (
        <Sign>
          <SignHeading title={JOIN_COPY.badLink} body={JOIN_COPY.badLinkBody} />
          {!house ? <Button href={DOOR.invite} variant="outline" label={JOIN_COPY.back} /> : null}
        </Sign>
      ) : house?.id === invite.id ? (
        <Sign>
          <SignHeading title={JOIN_COPY.alreadyIn(invite.name)} />
          <Button href="/today" label={JOIN_COPY.goToJohns} />
        </Sign>
      ) : house ? (
        <Sign>
          <SignHeading title={JOIN_COPY.otherHouse} body={JOIN_COPY.otherHouseBody} />
          <Button href="/today" variant="outline" label={JOIN_COPY.yourHouse} />
        </Sign>
      ) : (
        <Sign>
          <SignHeading above={JOIN_COPY.invited} title={invite.name} body={joinLine(invite.kind, invite.members)} />
          {invite.kind === 'family' ? null : (
            <Body testID="join-stake">
              {invite.stakeMinor > 0 || invite.lateMinor > 0 || invite.missedMinor > 0
                ? JOIN_COPY.stake(
                    formatMoney(invite.stakeMinor, invite.currency),
                    formatMoney(invite.lateMinor, invite.currency),
                    formatMoney(invite.missedMinor, invite.currency),
                  )
                : JOIN_COPY.noStake}
            </Body>
          )}
          {problem ? <Alert message={problem} /> : null}
          <Button
            label={joining ? JOIN_COPY.joining : FRONT_DOOR_COPY.join}
            onPress={() => void join()}
            disabled={joining}
            testID="join-house"
          />
        </Sign>
      )}
    </Door>
  );
}
