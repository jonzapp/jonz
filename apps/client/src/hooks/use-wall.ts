import { toggled, type ReactionKind } from '@app/core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { loadWall, loadWallEvents, setReaction, signPhoto, type Wall, type WallCursor } from '@/api/wall';
import { photoKey, wallKey } from '@/hooks/keys';

/** How many events the whole Wall reads at a time. */
const WALL_PAGE = 40;

/** One receipt, signed on its own (a settled John's sheet), whatever the Wall has read. */
export function usePhoto(houseId: string, path: string) {
  return useQuery({ queryKey: photoKey(houseId, path), queryFn: () => signPhoto(path) });
}

/**
 * Just the latest few of the Wall, for House, with no photos signed (House
 * never shows them): kept under the Wall, so a reaction or a move reads it
 * again too.
 */
export function useWallLatest(houseId: string, userId: string, count: number) {
  return useQuery({ queryKey: [...wallKey(houseId), 'latest', count], queryFn: () => loadWallEvents(houseId, userId, count) });
}

/**
 * The whole Wall, a page at a time, newest first: `fetchNextPage` reads the
 * page of events older than the last one shown, as you scroll near the end.
 */
export function useWallFeed(houseId: string, userId: string) {
  return useInfiniteQuery({
    queryKey: [...wallKey(houseId), 'feed'],
    queryFn: ({ pageParam }) => loadWall(houseId, userId, WALL_PAGE, pageParam ?? undefined),
    initialPageParam: null as WallCursor | null,
    getNextPageParam: (last) => last.older,
  });
}

/** A run of the Wall's pages as one: their events in order, and every photo's link. */
export function wallPages(pages: readonly Wall[]): Pick<Wall, 'events' | 'photos'> {
  return {
    events: pages.flatMap((page) => page.events),
    photos: Object.assign({}, ...pages.map((page) => page.photos)),
  };
}

/** A Wall in the cache, whichever way it was read: one page, or a run of them. */
type Cached = Wall | InfiniteData<Wall, WallCursor | null> | undefined;

function withToggle(cached: Cached, eventId: string, kind: ReactionKind): Cached {
  const flip = (wall: Wall): Wall => ({
    ...wall,
    events: wall.events.map((e) => (e.id === eventId ? { ...e, reactions: toggled(e.reactions, kind) } : e)),
  });
  if (!cached) return cached;
  return 'pages' in cached ? { ...cached, pages: cached.pages.map(flip) } : flip(cached);
}

/**
 * Reacting to an event shows at once, then the database is told; if it says
 * no, the Wall goes back as it was and `problem` says why, about the event
 * `problemAt`, so the screen can say it where the move was made. Every read
 * of the Wall shows it: the whole Wall, its pages, and House's latest.
 * `clear` puts the refusal away (another event's sheet opening, say).
 */
export function useReact(houseId: string, userId: string) {
  const client = useQueryClient();
  const [refused, setRefused] = useState<{ eventId: string; message: string } | null>(null);
  const key = wallKey(houseId);

  const mutation = useMutation({
    mutationFn: ({ eventId, kind, on }: { eventId: string; kind: ReactionKind; on: boolean }) =>
      setReaction(eventId, userId, kind, on),
    onMutate: async ({ eventId, kind }) => {
      setRefused(null);
      await client.cancelQueries({ queryKey: key });
      const before: [QueryKey, Cached][] = client.getQueriesData<Cached>({ queryKey: key });
      client.setQueriesData<Cached>({ queryKey: key }, (cached) => withToggle(cached, eventId, kind));
      return { before };
    },
    onError: (error, move, saved) => {
      for (const [queryKey, data] of saved?.before ?? []) client.setQueryData(queryKey, data);
      setRefused({ eventId: move.eventId, message: error.message });
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  const clear = useCallback(() => setRefused(null), []);

  return {
    react: (eventId: string, kind: ReactionKind, on: boolean) => mutation.mutate({ eventId, kind, on }),
    problem: refused?.message ?? null,
    problemAt: refused?.eventId ?? null,
    clear,
  };
}
