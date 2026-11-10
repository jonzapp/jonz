import { setupChecklist } from '@app/core';
import { CalendarDaysIcon, ListTodoIcon, ShuffleIcon } from 'lucide-react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { EmptyState } from '@/components/empty-state';
import { DealButton } from '@/components/house/deal-button';
import { useWords } from '@/hooks/use-words';

/**
 * Week with nothing on it. Before the house's first deal: "This week hasn't
 * been dealt yet", and for the admin the first deal as Today's setup
 * checklist has it (core's setupChecklist): with no Johns yet, an outline
 * way to add them, as a deal would be refused; then "Deal week 1", amber
 * (the only amber Week ever shows) once there are Johns and housemates,
 * outline before. Everyone else hears who will deal it. After that, a week
 * with nothing handed out says why.
 */
export function WeekEmpty({
  houseId,
  notStarted,
  isAdmin,
  adminName,
  johns,
  memberCount,
}: {
  houseId: string;
  /** Nothing has ever been dealt in this house. */
  notStarted: boolean;
  isAdmin: boolean;
  /** Who deals (core's whoDeals), for "Sam will deal it soon.", as Today says it. */
  adminName: string;
  /** The John list, for an admin before the first deal; null while it's being read. */
  johns: readonly unknown[] | null;
  memberCount: number;
}) {
  const words = useWords();
  if (!notStarted) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        title={words('today.notDealt.nothingThisWeek')}
        body={words('today.notDealt.nothingThisWeekBody')}
        testID="week-empty"
      />
    );
  }
  const steps = setupChecklist(johns, memberCount);
  const action = !isAdmin ? undefined : steps.johnCount === 0 ? (
    <ButtonRow atEdge>
      <Button variant="outline" icon={ListTodoIcon} label={words('today.nextUp.addJohns')} href="/house/johns" testID="add-johns" />
    </ButtonRow>
  ) : (
    <DealButton houseId={houseId} label={words('today.nextUp.dealWeek1')} variant={steps.ready ? 'primary' : 'outline'} />
  );
  return (
    <EmptyState
      icon={ShuffleIcon}
      title={words('week.summary.notDealt')}
      body={isAdmin ? words('week.summary.notDealtBody') : words('today.nextUp.waiting', { admin: adminName })}
      action={action}
      testID="week-not-dealt"
    />
  );
}
