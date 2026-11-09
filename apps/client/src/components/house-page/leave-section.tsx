import { firstName, FOCUS_SHELL_COPY, HOUSE_LOWER_COPY, leaveBar, leaveCost, roleCopy, BUSY_COPY } from '@app/core';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpenIcon, RefreshCwIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { handOver, removeMember } from '@/api/settings';
import { Avatar } from '@/components/avatar';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextLink } from '@/components/text-link';
import { houseKey } from '@/hooks/keys';
import type { HouseView } from '@/hooks/use-house';
import { useMembership } from '@/hooks/use-membership';
import { useStake } from '@/hooks/use-stake';
import { INSET, SPACE, useTheme } from '@/theme';

/**
 * Leaving the house, alone at the foot of House in hazard words, and the
 * footer under it. Its confirm says what leaving costs in money, from the
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
  const { colors } = useTheme();
  const client = useQueryClient();
  const { refresh } = useMembership();
  const stake = useStake(houseId, view.snapshot);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [heir, setHeir] = useState<string | null>(null);
  const { house, members, rules } = view.snapshot;

  // A read that failed, and isn't being tried again right now.
  const unread = stake.isError && !stake.isFetching;
  let cost: string = HOUSE_LOWER_COPY.costReading;
  if (stake.data) {
    cost = leaveCost({
      me: userId,
      month: stake.data.month,
      share: stake.data.projection.find((p) => p.userId === userId)?.received ?? 0,
      transfers: stake.data.transfers,
      members,
      currency: rules.currency,
    });
  } else if (unread) {
    cost = HOUSE_LOWER_COPY.costUnread;
  }
  const bar = leaveBar(userId, members);
  const roles = roleCopy(house.kind);
  const body = bar === 'last-admin' ? `${cost} ${roles.lastAdmin}` : bar === 'last-one' ? `${cost} ${HOUSE_LOWER_COPY.lastOne}` : cost;
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
      <Group>
        <Row
          leading={<DoorOpenIcon size={24} color={colors.hazard} aria-hidden />}
          title={HOUSE_LOWER_COPY.leave(house.name)}
          tone="hazard"
          onPress={() => {
            setProblem(null);
            setAsking(true);
            if (stake.isError) void stake.refetch();
          }}
          testID="leave"
        />
      </Group>
      <View style={styles.footer}>
        <Meta>{HOUSE_LOWER_COPY.noMoney}</Meta>
        <TextLink href="/privacy" label={HOUSE_LOWER_COPY.privacy} small testID="to-privacy" />
        <TextLink href="/terms" label={HOUSE_LOWER_COPY.terms} small testID="to-terms" />
      </View>
      <ConfirmSheet
        visible={asking}
        title={HOUSE_LOWER_COPY.leaveAsk(house.name)}
        body={body}
        confirmLabel={bar === 'last-admin' ? (heirName ? roles.handOver(heirName) : null) : HOUSE_LOWER_COPY.leaveConfirm}
        icon={DoorOpenIcon}
        busy={busy}
        busyLabel={bar === 'last-admin' ? BUSY_COPY.handingOver : BUSY_COPY.leaving}
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
        {unread ? (
          <TextButton
            label={FOCUS_SHELL_COPY.retry}
            icon={RefreshCwIcon}
            align="start"
            onPress={() => void stake.refetch()}
            testID="leave-retry"
          />
        ) : null}
      </ConfirmSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.lg },
  // The small print on the leading edge, the two links at its size after it.
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACE.lg, paddingLeft: INSET },
});
