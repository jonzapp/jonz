import { firstName, HISTORY_COPY, PERSON_COPY, RESET_COPY } from '@app/core';
import { RotateCcwIcon, ShieldCheckIcon, ShieldOffIcon, UserMinusIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Housemate } from '@/api/board';
import { removeMember, setRole } from '@/api/settings';
import { Alert } from '@/components/alert';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Group, GroupItem } from '@/components/group';
import { ResetSheet } from '@/components/reset-sheet';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { useHouse } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { useUndoOffer } from '@/hooks/use-undo-offer';
import { SECTION_GAP, useTheme } from '@/theme';
import { useRoleCopy } from '@/hooks/use-kind';

/**
 * What an admin can do about a housemate, on their page: make them an admin
 * (or a housemate again) at once, and remove them from the house in hazard
 * words, after a confirm. Remove sits in a group of its own under Admin,
 * as Leave does on House, so it can't be taken for its neighbour. Each goes
 * through the calls House's members list uses, and the database decides; a
 * refusal is a sentence where it was made. Either offers Undo in a toast.
 * Once this week is dealt, "Reset Tom's week" opens the reset sheet for
 * their Johns this week.
 */
export function PersonAdmin({ houseId, userId, person }: { houseId: string; userId: string; person: Housemate }) {
  const { colors } = useTheme();
  const role = useMove(houseId);
  const remove = useMove(houseId);
  const offer = useUndoOffer(houseId);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const weekId = useHouse(houseId, userId).view?.board.week?.id ?? null;
  const name = firstName(person.name);
  const admin = person.role === 'admin';
  const words = useRoleCopy().person;

  return (
    <View testID="person-admin" style={styles.stack}>
      <Section label={words.section}>
        <Row
          leading={<RowIcon icon={admin ? ShieldOffIcon : ShieldCheckIcon} />}
          title={admin ? words.makeMember : words.makeAdmin}
          meta={admin ? words.makeMemberMeta : words.makeAdminMeta}
          disabled={role.pending}
          onPress={() =>
            void role.run(() => setRole(houseId, person.userId, admin ? 'member' : 'admin')).then((done) => {
              if (done) offer(admin ? HISTORY_COPY.madeHousemate(name) : HISTORY_COPY.madeAdmin(name), 'role', person.userId);
            })
          }
          testID="toggle-admin"
        />
        {role.problem ? (
          <GroupItem>
            <Alert message={role.problem} />
          </GroupItem>
        ) : null}
        {weekId ? (
          <Row
            leading={<RowIcon icon={RotateCcwIcon} />}
            title={RESET_COPY.resetPerson(name)}
            meta={RESET_COPY.resetPersonMeta}
            onPress={() => setResetting(true)}
            testID="reset-person-week"
          />
        ) : null}
      </Section>
      <Group>
        <Row
          leading={<UserMinusIcon size={24} color={colors.hazard} aria-hidden />}
          title={PERSON_COPY.remove(name)}
          // "Remove Tom from the house" says whole on the narrowest phone.
          titleLines={2}
          tone="hazard"
          onPress={() => setConfirming(true)}
          testID="remove-person"
        />
      </Group>
      <ConfirmSheet
        visible={confirming}
        title={PERSON_COPY.removeTitle(name)}
        body={PERSON_COPY.removeBody(name)}
        confirmLabel={PERSON_COPY.removeConfirm(name)}
        icon={UserMinusIcon}
        busy={remove.pending}
        problem={remove.problem}
        onConfirm={() =>
          void remove.run(() => removeMember(houseId, person.userId)).then((done) => {
            if (!done) return;
            setConfirming(false);
            offer(HISTORY_COPY.removed(name), 'remove', person.userId);
          })
        }
        onClose={() => setConfirming(false)}
        testID="remove-sheet"
      />
      <ResetSheet
        ask={resetting && weekId ? { houseId, kind: 'person_week', week: weekId, user: person.userId } : null}
        userId={userId}
        words={{ person: person.name }}
        onClose={() => setResetting(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SECTION_GAP },
});
