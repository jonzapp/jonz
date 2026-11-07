import { buildWeekBoard, todayView, type WeekBoard } from '@app/core';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { loadHouse, type Housemate, type HouseSnapshot } from '@/api/board';
import { catchUp } from '@/api/house';
import { supabase } from '@/api/supabase';
import { houseKey } from '@/hooks/keys';
import { useNow } from '@/hooks/use-now';

export { houseKey };

/** A house as its screens show it, at one moment. */
export interface HouseView {
  snapshot: HouseSnapshot;
  board: WeekBoard;
  today: ReturnType<typeof todayView>;
  me: Housemate | null;
  now: Date;
}

/**
 * A house's rows from one read, built into this week's board at the current
 * minute, with Today's view of it for `userId`. `view` is null until the
 * first read lands.
 */
export function useHouse(houseId: string, userId: string): { query: UseQueryResult<HouseSnapshot>; view: HouseView | null } {
  const query = useQuery({ queryKey: houseKey(houseId), queryFn: () => loadHouse(houseId, new Date()) });
  const now = useNow();
  const snapshot = query.data;
  if (!snapshot) return { query, view: null };

  const family = snapshot.house.kind === 'family';
  const board = buildWeekBoard({
    week: snapshot.week,
    assignments: snapshot.assignments,
    disputes: snapshot.disputes,
    memberIds: snapshot.members.map((m) => m.userId),
    userId,
    everDealt: snapshot.house.everDealt,
    disputeHours: snapshot.rules.disputeHours,
    now,
    // In a family each kid's John earns what it says.
    ...(family ? { earners: snapshot.members.filter((m) => m.role !== 'admin').map((m) => m.userId) } : {}),
  });
  const me = snapshot.members.find((m) => m.userId === userId) ?? null;
  // In a family, a parent's Today lists the kids' ticks waiting for their OK.
  const parent = family && me?.role === 'admin';
  const today = todayView(board, userId, { now, graceHours: snapshot.rules.coverGraceHours }, parent);
  return { query, view: { snapshot, board, today, me, now } };
}

/**
 * When a housemate ticks, votes or disputes, every screen on the house
 * follows. Realtime applies the same RLS as a query, so the socket carries
 * the user's token; bursts fold into one refetch. The socket is a hint, not
 * a contract: coming back to the app refetches anyway (QueryProvider).
 */
export function useLiveHouse(houseId: string) {
  const client = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: houseKey(houseId) }), 400);
    };
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      const filter = `house_id=eq.${houseId}`;
      channel = supabase
        .channel(`house:${houseId}`)
        // What supabase_realtime publishes, as the web listens: a tick, a
        // dispute, and the Wall's events (a week closing, a token earned).
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter }, soon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter }, soon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes', filter }, soon)
        .subscribe();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [client, houseId]);
}

/**
 * Catch the house up as a screen comes into view, as a web page load does,
 * and read it again if the server had anything to do. Returns the same
 * catch-up, for pull to refresh: true when it read the house again.
 */
export function useCatchUp(houseId: string): () => Promise<boolean> {
  const client = useQueryClient();
  const freshen = useCallback(async () => {
    try {
      if (!(await catchUp(houseId))) return false;
      // A read already on its way may have left before the server's changes,
      // and React Query would fold this into it, so start it again.
      await client.cancelQueries({ queryKey: houseKey(houseId) });
      await client.invalidateQueries({ queryKey: houseKey(houseId) });
      return true;
    } catch (reason) {
      // Only means this look is a little out of date.
      console.warn('Catching up failed', reason);
      return false;
    }
  }, [client, houseId]);

  useFocusEffect(
    useCallback(() => {
      void freshen();
    }, [freshen]),
  );
  return freshen;
}
