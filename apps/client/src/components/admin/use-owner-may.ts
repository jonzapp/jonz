import type { OwnerPermission } from '@app/core';
import { useQuery } from '@tanstack/react-query';

import { ownerStatus } from '@/api/owner';

/**
 * Whether the person on the admin pages may do `permission` (their app role,
 * from owner_status, which the admin layout has already read). A page uses
 * it to offer only what they may do; the database checks every move again,
 * so this is the page being polite, not the lock.
 */
export function useOwnerMay(permission: OwnerPermission): boolean {
  const status = useQuery({ queryKey: ['owner-status'], queryFn: ownerStatus, staleTime: 60_000 });
  return status.data?.permissions.includes(permission) ?? false;
}
