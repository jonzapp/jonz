import { roleCopy, type HouseKind } from '@app/core';

import { useWords } from '@/hooks/use-words';

/** The words for the roles in your house: admin and housemate, or parent and kid. */
export function useRoleCopy(kind?: HouseKind): ReturnType<typeof roleCopy> {
  return roleCopy(useWords(kind));
}

