import type { DeletionStatus, Language } from '@app/core';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deletionStatus } from '@/api/account';
import { setApiReader } from '@/api/base';
import { getMyHouse, type MyHouse } from '@/api/house';
import { myLanguage, setMyLanguage } from '@/api/language';
import { followMicrosoftSignIns } from '@/api/microsoft-photo';
import { HouseKindContext, LanguageContext } from '@/hooks/use-words';
import { useSession } from '@/hooks/use-session';
import { deviceLanguage } from '@/locale';

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

type Read = { house: MyHouse | null; deletion: DeletionStatus | null; language: Language | null };
type Known = ({ userId: string } & Read) | { userId: string; failed: true };

/**
 * The house, whether the account is being deleted, and your language. A
 * deletion or language that can't be read counts as none: the house decides
 * whether the app can open. With no language saved yet, your phone's is
 * saved, so emails and pushes know it too.
 */
async function readMembership(userId: string): Promise<Read> {
  const [house, deletion, language] = await Promise.all([
    getMyHouse(userId),
    deletionStatus().catch(() => null),
    myLanguage().catch(() => undefined),
  ]);
  if (language === null) {
    const phone = deviceLanguage();
    setMyLanguage(phone).catch((reason: unknown) => console.warn('Saving your language failed', reason));
    return { house, deletion, language: phone };
  }
  return { house, deletion, language: language ?? null };
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
  const language = (current && 'language' in current ? current.language : null) ?? deviceLanguage();

  const change = useCallback(
    async (next: Language) => {
      if (!userId) return;
      const speak = (said: Language) =>
        setKnown((now) => (now && now.userId === userId && 'house' in now ? { ...now, language: said } : now));
      speak(next);
      try {
        await setMyLanguage(next);
      } catch (reason) {
        // Back to the one that's saved, so this device never reads a language the others don't.
        speak(language);
        throw reason;
      }
    },
    [userId, language],
  );

  const value: Membership = {
    session,
    signedOut: ended === true,
    house: current && 'house' in current ? current.house : null,
    deletion: current && 'deletion' in current ? current.deletion : null,
    loading: sessionLoading || (userId !== undefined && current === null),
    failed: current !== null && 'failed' in current,
    refresh,
  };
  const yours = useMemo(() => ({ language, change }), [language, change]);
  const kind = value.house?.kind ?? 'housemates';
  // What the API says back is read in your language, with your house's words.
  useEffect(() => setApiReader(language, kind), [language, kind]);
  return (
    <MembershipContext.Provider value={value}>
      <LanguageContext.Provider value={yours}>
        <HouseKindContext.Provider value={kind}>{children}</HouseKindContext.Provider>
      </LanguageContext.Provider>
    </MembershipContext.Provider>
  );
}

export function useMembership(): Membership {
  const membership = useContext(MembershipContext);
  if (!membership) throw new Error('useMembership needs a MembershipProvider (the root layout has one).');
  return membership;
}
