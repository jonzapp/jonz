import { photoPaths, wallEvents, type ReactionKind, type WallEvent } from '@app/core';

import { snakeKeys } from './base';
import { supabase } from './supabase';
import { callV1 } from './v1';

// The Wall: what the house did, and your reactions, on /v1. Receipts are
// signed links from Storage until files move to files.jonz.app.

/** How long a photo's signed link lasts: long enough to look, short enough not to share. */
const PHOTO_SECONDS = 3600;

export interface Wall {
  events: WallEvent[];
  /** Signed links for the receipts on show, by their path in `proofs`. */
  photos: Record<string, string>;
  /** Where the next page of older events starts, when this one came back full; null at the start of the house. */
  older: WallCursor | null;
}

/** Where the page of older events starts: what /v1 answered with the last page. */
export type WallCursor = string;

/**
 * The latest of the house's events, with their photos signed for an hour.
 * With `before`, the page of events older than that cursor instead.
 */
export async function loadWall(houseId: string, userId: string, limit = 60, before?: WallCursor): Promise<Wall> {
  const { events, older } = await readEvents(houseId, userId, limit, before);
  const paths = photoPaths(events);
  const photos: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from('proofs').createSignedUrls(paths, PHOTO_SECONDS);
    for (const s of signed ?? []) if (s.signedUrl && s.path) photos[s.path] = s.signedUrl;
  }
  return { events, photos, older };
}

/**
 * One receipt's link, signed for an hour: a settled John's sheet shows its
 * photo with it, whatever the Wall has read.
 */
export async function signPhoto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('proofs').createSignedUrl(path, PHOTO_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** The latest few of the house's events, with no photos signed: House's Wall never shows them. */
export async function loadWallEvents(houseId: string, userId: string, limit: number): Promise<Wall> {
  return { ...(await readEvents(houseId, userId, limit)), photos: {} };
}

/** One page of events, newest first, and where the next one starts. */
async function readEvents(
  houseId: string,
  userId: string,
  limit: number,
  before?: WallCursor,
): Promise<Pick<Wall, 'events' | 'older'>> {
  const page = await callV1('house_wall', { houseId, limit, startingAfter: before });
  const rows = page.data.map((e) => ({
    id: e.id,
    kind: e.kind,
    user_id: e.userId,
    assignment_id: e.assignmentId,
    // What happened, in its own names ("starts_on").
    data: snakeKeys(e.data),
    created_at: e.createdAt,
    assignments: { photo_path: e.photoPath },
    reactions: e.reactions.map((r) => ({ user_id: r.userId, kind: r.kind })),
  }));
  return { events: wallEvents(rows, userId), older: page.hasMore ? page.startingAfter : null };
}

/** React to an event, or take your reaction back. */
export async function setReaction(eventId: string, _userId: string, kind: ReactionKind, on: boolean): Promise<void> {
  await callV1(on ? 'react' : 'unreact', { eventId, kind });
}
