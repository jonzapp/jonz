import type { DeletionStatus } from '@app/core';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { deletionStatus } from '@/api/account';
import { getMyHouse, type MyHouse } from '@/api/house';
import { followMicrosoftSignIns } from '@/api/microsoft-photo';
import { HouseKindContext } from '@/hooks/use-copy';
import { useSession } from '@/hooks/use-session';

/** Who is signed in and which house they're in: what every screen's guard needs. */
export interface Membership {
  session: Session | null;
  /** A session ended here (Sign out), rather than nobody having signed in. */
  signedOut: boolean;
  house: MyHouse | null;
  /** When the account goes, while it waits to be deleted: the app shows only that, and Keep my account. */
  deletion: DeletionStatus | null;
  /** The saved session, or the house for it, is still being read. */
  loading: boolean;
  /** The house couldn't be read (offline, say), so nothing is known. */
  failed: boolean;
  /** Read the house again: after creating or joining one, or keeping or deleting the account. */
  refresh: () => Promise<void>;
}

const MembershipContext = createContext<Membership | null>(null);

type Known = { userId: string; house: MyHouse | null; deletion: DeletionStatus | null } | { userId: string; failed: true };

/**
 * The house, and whether the account is being deleted. A deletion that
 * can't be read counts as none: the house decides whether the app can open.
 */
async function readMembership(userId: string): Promise<{ house: MyHouse | null; deletion: DeletionStatus | null }> {
  const [house, deletion] = await Promise.all([getMyHouse(userId), deletionStatus().catch(() => null)]);
  return { house, deletion };
}

export function MembershipProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading, ended } = useSession();
  const userId = session?.user.id;
  const [known, setKnown] = useState<Known | null>(null);

  // A Microsoft sign-in brings its photo along (microsoft-photo.ts).
  useEffect(() => followMicrosoftSignIns(), []);

  useEffect(() => {
    if (!userId) return;
    // Only the answer for whoever is still signed in counts.
    let active = true;
    readMembership(userId)
      .then((read) => {
        if (active) setKnown({ userId, ...read });
      })
      .catch(() => {
        if (active) setKnown({ userId, failed: true });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setKnown({ userId, ...(await readMembership(userId)) });
    } catch {
      setKnown({ userId, failed: true });
    }
  }, [userId]);

  // What's known only counts for the person signed in now.
  const current = userId && known?.userId === userId ? known : null;
  const value: Membership = {
    session,
    signedOut: ended === true,
    house: current && 'house' in current ? current.house : null,
    deletion: current && 'deletion' in current ? current.deletion : null,
    loading: sessionLoading || (userId !== undefined && current === null),
    failed: current !== null && 'failed' in current,
    refresh,
  };
  return (
    <MembershipContext.Provider value={value}>
      <HouseKindContext.Provider value={value.house?.kind ?? 'housemates'}>{children}</HouseKindContext.Provider>
    </MembershipContext.Provider>
  );
}

export function useMembership(): Membership {
  const membership = useContext(MembershipContext);
  if (!membership) throw new Error('useMembership needs a MembershipProvider (the root layout has one).');
  return membership;
}
