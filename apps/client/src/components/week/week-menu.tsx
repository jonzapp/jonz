import { RESET_COPY, type ResetKind, BUSY_COPY } from '@app/core';
import { useRouter } from 'expo-router';
import { CircleSlashIcon, ListTodoIcon, PlaneIcon, RotateCcwIcon, ShuffleIcon } from 'lucide-react-native';
import { useState } from 'react';

import { dealThisWeek } from '@/api/settings';
import { ActionMenu, type MenuAction } from '@/components/action-menu';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { ResetSheet } from '@/components/reset-sheet';
import { useToast } from '@/components/toast';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';

/**
 * Week's "•••" menu: "I'm away…" (Time away) for everyone; for admins, "Edit
 * the John list" and fixing the week. While nothing this week is ticked,
 * "Re-deal this week" asks first, then deals the way the deal button does.
 * Once something is, re-dealing is a reset, beside "Reset this week" and
 * "Skip this week": each opens the reset sheet, which says what it changes
 * before it does. The server checks it's an admin asking; a refusal shows
 * where it was made.
 */
export function WeekMenu({
  visible,
  onClose,
  houseId,
  admin,
  canRedeal,
  weekId,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  houseId: string;
  admin: boolean;
  /** This week is dealt and nothing in it has been ticked. */
  canRedeal: boolean;
  /** This week, once dealt. */
  weekId: string | null;
  /** Who's looking. */
  userId: string;
}) {
  const words = useWords();
  const router = useRouter();
  const toast = useToast();
  const deal = useMove(houseId);
  const [confirming, setConfirming] = useState(false);
  // The last refusal belongs to the confirm it was made in, not the next one.
  const [asked, setAsked] = useState(false);
  const [resetting, setResetting] = useState<ResetKind | null>(null);

  const actions: MenuAction[] = [
    { label: words('week.summary.awayAction'), icon: PlaneIcon, onPress: () => router.push('/house/away'), testID: 'menu-away' },
  ];
  if (admin) {
    actions.push({ label: words('week.summary.editJohns'), icon: ListTodoIcon, onPress: () => router.push('/house/johns'), testID: 'menu-johns' });
    if (canRedeal) {
      actions.push({
        label: words('week.summary.redeal'),
        icon: ShuffleIcon,
        onPress: () => {
          setAsked(false);
          setConfirming(true);
        },
        testID: 'menu-redeal',
      });
    }
    if (weekId) {
      actions.push({ label: RESET_COPY.resetWeek, icon: RotateCcwIcon, onPress: () => setResetting('week'), testID: 'menu-reset-week' });
      if (!canRedeal) {
        actions.push({ label: RESET_COPY.redeal, icon: ShuffleIcon, onPress: () => setResetting('redeal'), testID: 'menu-reset-redeal' });
      }
      actions.push({ label: RESET_COPY.skip, icon: CircleSlashIcon, onPress: () => setResetting('skip'), testID: 'menu-skip-week' });
    }
  }

  async function redeal() {
    setAsked(true);
    if (await deal.run(() => dealThisWeek(houseId))) {
      setConfirming(false);
      toast.show(words('week.summary.redealt'));
    }
  }

  return (
    <>
      <ActionMenu visible={visible} onClose={onClose} actions={actions} testID="week-menu" />
      <ConfirmSheet
        visible={confirming}
        title={words('week.summary.redealTitle')}
        body={words('week.summary.redealBody')}
        confirmLabel={words('week.summary.redeal')}
        icon={ShuffleIcon}
        tone="primary"
        busy={deal.pending}
        busyLabel={BUSY_COPY.dealing}
        problem={asked ? deal.problem : null}
        onConfirm={() => void redeal()}
        onClose={() => setConfirming(false)}
        testID="redeal-confirm"
      />
      <ResetSheet
        ask={resetting && weekId ? { houseId, kind: resetting, week: weekId } : null}
        userId={userId}
        words={{}}
        onClose={() => setResetting(null)}
      />
    </>
  );
}
