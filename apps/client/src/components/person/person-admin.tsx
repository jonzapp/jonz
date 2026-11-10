import { firstName, RESET_COPY, BUSY_COPY } from '@app/core';
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
import { useWords } from '@/hooks/use-words';
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
  const copy = useRoleCopy().person;
  const words = useWords();

  return (
    <View testID="person-admin" style={styles.stack}>
      <Section label={copy.section}>
        <Row
          leading={<RowIcon icon={admin ? ShieldOffIcon : ShieldCheckIcon} />}
          title={admin ? copy.makeMember : copy.makeAdmin}
          meta={admin ? copy.makeMemberMeta : copy.makeAdminMeta}
          disabled={role.pending}
          onPress={() =>
            void role.run(() => setRole(houseId, person.userId, admin ? 'member' : 'admin')).then((done) => {
              if (done) offer(words(admin ? 'wall.history.madeMember' : 'wall.history.madeAdmin', { name }), 'role', person.userId);
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
          title={words('people.person.remove', { name })}
          // "Remove Tom from the house" says whole on the narrowest phone.
          titleLines={2}
          tone="hazard"
          onPress={() => setConfirming(true)}
          testID="remove-person"
        />
      </Group>
      <ConfirmSheet
        visible={confirming}
        title={words('people.person.removeTitle', { name })}
        body={words('people.person.removeBody', { name })}
        confirmLabel={words('people.person.removeConfirm', { name })}
        icon={UserMinusIcon}
        busy={remove.pending}
        busyLabel={BUSY_COPY.removing}
        problem={remove.problem}
        onConfirm={() =>
          void remove.run(() => removeMember(houseId, person.userId)).then((done) => {
            if (!done) return;
            setConfirming(false);
            offer(words('wall.history.removed', { name }), 'remove', person.userId);
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
