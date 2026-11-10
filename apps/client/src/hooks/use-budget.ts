import { budgetChoices, type DealMode } from '@app/core';
import { useMemo } from 'react';

import { useJohnList } from '@/hooks/use-john-list';
import { useWords } from '@/hooks/use-words';

/**
 * The budget sheet's choices for this house: what each budget does to its
 * own list, with the one that fits marked (core's budgetChoices, which runs
 * the list forward through the deal). Null until the list has been read.
 */
export function useBudgetChoices(houseId: string, memberIds: readonly string[], mode: DealMode) {
  const words = useWords();
  const list = useJohnList(houseId);
  const people = memberIds.join(',');
  return useMemo(() => {
    if (!list.data) return null;
    const groups = Object.fromEntries(list.data.groups.map((g) => [g.id, g.memberIds]));
    return budgetChoices(list.data.johns, people ? people.split(',') : [], groups, mode, words);
  }, [list.data, people, mode, words]);
}
