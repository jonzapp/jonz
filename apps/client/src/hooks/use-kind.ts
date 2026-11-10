import { roleCopy, type HouseKind } from '@app/core';

import { useMembership } from '@/hooks/use-membership';

/** Whether your house is housemates or a family (houses.kind); housemates until it's known. */
export function useHouseKind(): HouseKind {
  return useMembership().house?.kind ?? 'housemates';
}

/** The words for the roles in your house: admin and housemate, or parent and kid. */
export function useRoleCopy(): ReturnType<typeof roleCopy> {
  return roleCopy(useHouseKind());
}

