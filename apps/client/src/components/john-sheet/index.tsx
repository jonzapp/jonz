import { hasPass, rulesAsStaked, UTC, type StakeView } from '@app/core';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { Sheet } from '@/components/sheet';
import { stakeKey } from '@/hooks/keys';
import { useHouse } from '@/hooks/use-house';
import { useShownZone } from '@/hooks/use-zones';

import { JohnSheetBody, type JohnSheetContext, type JohnSheetFocus } from './body';
import { useCached } from './cached';
import { useWords } from '@/hooks/use-words';

export type { JohnSheetFocus } from './body';

interface JohnSheetApi {
  /**
   * Open the sheet on one John (an assignment's id), optionally at what it
   * was opened for, and from which Wall post (an event's id), whose
   * reactions it then shows.
   */
  open: (assignmentId: string, focus?: JohnSheetFocus, post?: string) => void;
  close: () => void;
}

const JohnSheetApiContext = createContext<JohnSheetApi | null>(null);

/** Open any John's sheet from anywhere in the house: `useJohnSheet().open(item.id)`. */
export function useJohnSheet(): JohnSheetApi {
  const api = useContext(JohnSheetApiContext);
  if (!api) throw new Error('useJohnSheet needs a JohnSheetProvider above it (the house layout has one).');
  return api;
}

/** The John sheet's opener where there may be none above (a chat reply drawn outside the house): null then. */
export function useJohnSheetIfAny(): JohnSheetApi | null {
  return useContext(JohnSheetApiContext);
}

/**
 * The one John sheet: every John action lives in it, opened by tapping a
 * John anywhere (Today, Week, House). Mounted once, in the house layout. It
 * reads the John live from the house's board by id, so it follows ticks and
 * votes as they land, and puts itself away if the John goes (a re-deal).
 */
export function JohnSheetProvider({ houseId, userId, children }: { houseId: string; userId: string; children: ReactNode }) {
  const words = useWords();
  const { view } = useHouse(houseId, userId);
  // Times on the reader's own clock when it's away from the house's (Your time, said once).
  const zone = useShownZone(view?.snapshot.rules.timezone ?? UTC, view?.now ?? new Date());
  // What lateness costs is capped at the stake: the sheet knows how near once a screen has read the Stake.
  const stake = useCached<StakeView>(stakeKey(houseId)) ?? null;
  const [shown, setShown] = useState<{ id: string; focus: JohnSheetFocus | null; post: string | null } | null>(null);

  const open = useCallback(
    (id: string, focus?: JohnSheetFocus, post?: string) => setShown({ id, focus: focus ?? null, post: post ?? null }),
    [],
  );
  const close = useCallback(() => setShown(null), []);
  const api = useMemo(() => ({ open, close }), [open, close]);

  const item = shown && view ? (view.board.items.find((i) => i.id === shown.id) ?? null) : null;
  // Asked for a John the board doesn't have (any more, after a re-deal):
  // put the sheet away, so it stays shut should that id come back. (Set
  // while rendering, as React suggests for state that follows other state.)
  if (shown !== null && view !== null && item === null) setShown(null);

  let body: ReactNode = null;
  if (item && view && shown) {
    const members = view.snapshot.members;
    const context: JohnSheetContext = {
      houseId,
      userId,
      zone,
      // Without the Stake (a House Pass extra), nothing late costs anything.
      rules: rulesAsStaked(view.snapshot.rules, hasPass(view.snapshot.house.pass, view.now)),
      now: view.now,
      nameOf: (id) => members.find((m) => m.userId === id)?.name ?? words('common.shell.formerHousemate'),
      members,
      me: view.me,
      board: view.board,
      stake,
      focus: shown.focus,
      post: shown.post,
      close,
    };
    // Keyed by the John and what it was opened for, so what one John's sheet
    // had under way (a swap, a dispute's words) never carries to the next.
    body = <JohnSheetBody key={`${item.id}:${shown.focus ?? ''}:${shown.post ?? ''}`} item={item} context={context} />;
  }

  return (
    <JohnSheetApiContext.Provider value={api}>
      {children}
      {/* Opened for something with a part of its own (If you can't), it opens scrolled to that part. Named after the John. */}
      <Sheet visible={item !== null} label={item?.name} onClose={close} flush openAt={shown?.focus ?? undefined} testID="john-sheet">
        {body}
      </Sheet>
    </JohnSheetApiContext.Provider>
  );
}
