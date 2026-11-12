import { DELETION_DAYS, firstName, leaveBar, leaveCost, roleCopy } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpenIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { handOver, removeMember } from '@/api/settings';
import { Avatar } from '@/components/avatar';
import { DeleteAccountForm } from '@/components/account/delete-account';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { DangerRow, DangerZone } from '@/components/danger-zone';
import { Field } from '@/components/field';
import { Group } from '@/components/group';
import { namesHouse } from '@/components/house/house-danger-zone';
import { Sheet } from '@/components/sheet';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextLink } from '@/components/text-link';
import { houseKey } from '@/hooks/keys';
import type { HouseView } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { useStake } from '@/hooks/use-stake';
import { INSET, SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * Your Danger zone, at the foot of You for everyone (docs/specs/house-reset.md
 * has the zone itself): Leave the house and Delete my account, each a
 * DangerRow whose hazard button opens its own sheet, and the footer under
 * it. Delete my account's sheet is DeleteAccountForm, which waits for the
 * word to be typed; Leave's waits for the house's name, as the resets do. Its confirm says what leaving costs in money, from the
 * Stake once it's read (your share so far of the month's forfeits, and any
 * settling up still open with you), then leaves; the house's screens close
 * behind you as the guard moves you on. Until the Stake is read it says so,
 * and if it can't be, it says that instead, with Try again under it, and
 * asks again the next time the sheet opens. The only admin of a house with
 * others in it picks who looks after it, and leaves by handing over
 * ("Make Sam admin and leave"), one step; the last one out is told the
 * house will be empty.
 */
export function LeaveSection({ houseId, userId, view }: { houseId: string; userId: string; view: HouseView }) {
  const words = useWords();
  const client = useQueryClient();
  const { refresh } = useMembership();
  const stake = useStake(houseId, view.snapshot);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [heir, setHeir] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const { house, members, rules } = view.snapshot;

  // A read that failed, and isn't being tried again right now.
  const unread = stake.isError && !stake.isFetching;
  let cost: string = words('house.lower.costReading');
  if (stake.data) {
    cost = leaveCost({
      me: userId,
      month: stake.data.month,
      share: stake.data.projection.find((p) => p.userId === userId)?.received ?? 0,
      transfers: stake.data.transfers,
      members,
      currency: rules.currency,
    }, words);
  } else if (unread) {
    cost = words('house.lower.costUnread');
  }
  const bar = leaveBar(userId, members);
  const roles = roleCopy(useWords(house.kind));
  const body = bar === 'last-admin' ? `${cost} ${roles.lastAdmin}` : bar === 'last-one' ? `${cost} ${words('house.lower.lastOne')}` : cost;
  const heirName = heir ? firstName(members.find((m) => m.userId === heir)?.name ?? '') : null;

  async function leave() {
    setBusy(true);
    setProblem(null);
    try {
      if (bar === 'last-admin') await handOver(houseId, heir!);
      else await removeMember(houseId, userId);
    } catch (reason) {
      setProblem(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
      return;
    }
    // Not a move to read the house again after: it isn't yours any more. The
    // guard takes you to starting or joining one.
    await refresh();
    client.removeQueries({ queryKey: houseKey(houseId) });
  }

  return (
    <View testID="leave-section" style={styles.stack}>
      <DangerZone testID="you-danger-zone">
        <DangerRow
          title={words('house.lower.leave', { house: house.name })}
          meta={words('house.lower.leaveMeta')}
          action={words('house.lower.leaveButton')}
          icon={DoorOpenIcon}
          onPress={() => {
            setProblem(null);
            setTyped('');
            setAsking(true);
            if (stake.isError) void stake.refetch();
          }}
          testID="leave"
        />
        <DangerRow
          title={words('people.delete.row')}
          meta={words('people.delete.meta', { days: DELETION_DAYS })}
          action={words('people.delete.button')}
          icon={Trash2Icon}
          onPress={() => setDeleting(true)}
          testID="to-delete-account"
        />
      </DangerZone>
      <View style={styles.footer}>
        <Meta>{words('house.lower.noMoney')}</Meta>
        <TextLink href="/privacy" label={words('house.lower.privacy')} small testID="to-privacy" />
        <TextLink href="/terms" label={words('house.lower.terms')} small testID="to-terms" />
      </View>
      <ConfirmSheet
        visible={asking}
        title={words('house.lower.leaveAsk', { house: house.name })}
        body={body}
        confirmLabel={bar === 'last-admin' ? (heirName ? roles.handOver(heirName) : null) : words('house.lower.leaveConfirm')}
        icon={DoorOpenIcon}
        ready={namesHouse(typed, house.name)}
        busy={busy}
        busyLabel={bar === 'last-admin' ? words('common.busy.handingOver') : words('common.busy.leaving')}
        problem={problem}
        onConfirm={() => void leave()}
        onClose={() => setAsking(false)}
        testID="leave-sheet"
      >
        {bar === 'last-admin' ? (
          <Group testID="hand-over">
            {members
              .filter((m) => m.userId !== userId)
              .map((m) => (
                <ChoiceRow
                  key={m.userId}
                  role="radio"
                  label={m.name}
                  leading={<Avatar name={m.name} userId={m.userId} />}
                  checked={heir === m.userId}
                  onPress={() => setHeir(m.userId)}
                  testID="heir"
                />
              ))}
          </Group>
        ) : null}
        <Field
          label={words('house.lower.leaveTypeName')}
          value={typed}
          onChangeText={setTyped}
          placeholder={house.name}
          autoCapitalize="none"
          autoCorrect={false}
          testID="leave-name"
        />
        {unread ? (
          <TextButton
            label={words('common.shell.retry')}
            icon={RefreshCwIcon}
            align="start"
            onPress={() => void stake.refetch()}
            testID="leave-retry"
          />
        ) : null}
      </ConfirmSheet>
      <Sheet visible={deleting} title={words('people.delete.title')} onClose={() => setDeleting(false)} testID="delete-sheet">
        <DeleteAccountForm onKeep={() => setDeleting(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.lg },
  // The small print on the leading edge, the two links at its size after it.
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACE.lg, paddingLeft: INSET },
});
