import {
  markTourSeen,
  readToursSaved,
  tourSpotInWindow,
  tourSteps,
  type TourFacts,
  type TourId,
  type TourRect,
  type TourSpotId,
  type TourStepSaid,
  type ToursSaved,
} from '@app/core';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';

import { saveToursSaved } from '@/api/tours';
import { HelpSheet } from '@/components/tour/help-sheet';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { TourContext, type TourControls } from '@/components/tour/tour-context';
import { SpotRegistryContext, type SpotHandle, type SpotRegistry } from '@/components/tour/tour-spot';
import { useMembership } from '@/hooks/use-membership';
import { useWords } from '@/hooks/use-words';

/** How long a step waits for its spot to show (a page to open, a read to land) before it's passed over. */
const FIND_FOR = 2500;
const FIND_EVERY = 100;
/** How long a step looks for its spot before its card shows anyway, at the window's foot, so Skip and Next are always there. */
const CARD_AFTER = 400;
/** Once lit, how often the spot is measured again: a page still settling (a read landing, a phone's toolbar, a slow scroll) moves it. */
const WATCH_EVERY = 250;

type Running = { id: TourId; steps: TourStepSaid[]; index: number };

const trimmed = (path: string) => path.replace(/\/+$/, '') || '/';

/**
 * Plays tours, and holds the Help sheet that starts them. Mounted once in
 * the house layout, round every tab, like the John sheet: a tour can walk
 * across pages. `facts` (an admin? a laptop? anything to check?) decide
 * which steps a tour shows, read when it starts.
 *
 * Spots sign in as they mount (TourSpot). For each step the player opens
 * the step's page if it isn't the one showing, waits for the spot to show,
 * scrolls it into view and lights it, then keeps measuring it so the light
 * follows it if the page moves; a spot that doesn't show within FIND_FOR is
 * passed over. The card never waits on the spot for long: after CARD_AFTER
 * it shows at the window's foot, so the way on is always there. Finishing or skipping saves the tour as seen on
 * your account, so the offer on Today goes, and the Help sheet marks it.
 */
export function TourProvider({ facts, canAsk = false, children }: { facts: TourFacts; canAsk?: boolean; children: ReactNode }) {
  const words = useWords();
  const { session } = useMembership();
  const pathname = usePathname();
  const window = useWindowDimensions();
  const spots = useRef(new Map<TourSpotId, SpotHandle[]>());
  // Spots a page can bring out on asking (House's Table and Wall, behind a phone's switch).
  const offers = useRef(new Map<TourSpotId, () => void>());
  const [running, setRunning] = useState<Running | null>(null);
  const [rect, setRect] = useState<TourRect | null>(null);
  // Still looking for this step's spot, before its card shows without it.
  const [looking, setLooking] = useState(true);
  const [help, setHelp] = useState(false);
  const pending = useRef<TourId | null>(null);
  // What the account says, until this device changes it: then what it changed it to, saved behind.
  const [changed, setChanged] = useState<ToursSaved | null>(null);
  const saved = changed ?? readToursSaved(session?.user.user_metadata);

  const registry = useMemo<SpotRegistry>(
    () => ({
      add(id, handle) {
        const list = spots.current.get(id) ?? [];
        spots.current.set(id, [...list, handle]);
        return () => spots.current.set(id, (spots.current.get(id) ?? []).filter((h) => h !== handle));
      },
      offer(ids, show) {
        for (const id of ids) offers.current.set(id, show);
        return () => ids.forEach((id) => offers.current.get(id) === show && offers.current.delete(id));
      },
    }),
    [],
  );

  const keep = useCallback((next: ToursSaved) => {
    setChanged(next);
    // A failed save costs nothing but seeing the offer again: no message for it.
    saveToursSaved(next).catch(() => undefined);
  }, []);

  const finish = useCallback(
    (id: TourId) => {
      setRunning(null);
      setRect(null);
      keep(markTourSeen(saved, id));
    },
    [keep, saved],
  );

  const start = useCallback(
    (id: TourId) => {
      // On the page you're on every spot that's drawn has signed in: leave out the ones that haven't
      // (nothing else this week, say), so the count is what you'll see. Other pages' are looked for as they open.
      const here = trimmed(pathname);
      // A spot the page can bring out (behind a switch) counts as there.
      const steps = tourSteps(id, facts, words).filter(
        (s) => s.page !== here || (spots.current.get(s.spot)?.length ?? 0) > 0 || offers.current.has(s.spot),
      );
      if (steps.length === 0) return;
      setRect(null);
      setLooking(true);
      setRunning({ id, steps, index: 0 });
    },
    [facts, pathname, words],
  );

  const move = useCallback(
    (by: 1 | -1) => {
      if (!running) return;
      const index = running.index + by;
      if (index < 0) return;
      if (index >= running.steps.length) return finish(running.id);
      setRect(null);
      setLooking(true);
      setRunning({ ...running, index });
    },
    [running, finish],
  );

  // Each step: open its page, find its spot, bring it into view, light it.
  const step = running ? running.steps[running.index] : null;
  const stepKey = running ? `${running.id}:${running.index}` : null;
  useEffect(() => {
    if (!step) return;
    let live = true;
    if (trimmed(pathname) !== step.page) router.navigate(step.page);
    const began = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [setTimeout(() => live && setLooking(false), CARD_AFTER)];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    let last: TourRect | null = null;
    const light = (where: TourRect) => {
      if (last && sameRect(last, where)) return;
      last = where;
      setRect(where);
    };
    // Lit: measure it again now and then, and bring it back into view if the page has moved it off.
    const watch = async (handle: SpotHandle): Promise<void> => {
      if (!live) return;
      const where = await handle.measure();
      if (!live) return;
      if (where) {
        if (!tourSpotInWindow(where, { width: windowNow().width, height: windowNow().height })) handle.reveal();
        else light(where);
      }
      later(() => void watch(handle), WATCH_EVERY);
    };
    const look = async (): Promise<void> => {
      if (!live) return;
      const found = await showing(spots.current.get(step.spot) ?? []);
      if (!live) return;
      // Not drawn, but its page can bring it out: ask, and look again.
      if (!found) offers.current.get(step.spot)?.();
      if (found) {
        found.handle.reveal();
        // Once the scroll has moved it, measure again where it ended up.
        await frames(2);
        if (!live) return;
        light((await found.handle.measure()) ?? found.rect);
        later(() => void watch(found.handle), WATCH_EVERY);
        return;
      }
      if (Date.now() - began >= FIND_FOR) {
        // Not on screen: pass it over rather than dim a page with nothing lit.
        move(1);
        return;
      }
      later(() => void look(), FIND_EVERY);
    };
    void look();
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
    // The step and the window's size: a turned phone or a resized window measures again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, window.width, window.height]);

  const controls = useMemo<TourControls>(
    () => ({
      start,
      openHelp: () => setHelp(true),
      running: running !== null,
      facts,
      saved,
      dismissOffer: () => keep({ ...saved, offerDone: true }),
    }),
    [start, running, facts, saved, keep],
  );

  return (
    <TourContext.Provider value={controls}>
      <SpotRegistryContext.Provider value={registry}>
        {children}
        <HelpSheet
          visible={help}
          page={pathname}
          canAsk={canAsk}
          onClose={() => setHelp(false)}
          onTour={(id) => {
            pending.current = id;
            setHelp(false);
          }}
          onDismissed={() => {
            const id = pending.current;
            pending.current = null;
            if (id) start(id);
          }}
        />
        {running && step ? (
          <TourOverlay
            step={step}
            index={running.index}
            total={running.steps.length}
            rect={rect}
            looking={looking}
            wide={facts.wide}
            onNext={() => move(1)}
            onBack={() => move(-1)}
            onSkip={() => finish(running.id)}
          />
        ) : null}
      </SpotRegistryContext.Provider>
    </TourContext.Provider>
  );
}

/** The newest of a spot's handles that's showing, with where it is. */
async function showing(handles: SpotHandle[]): Promise<{ handle: SpotHandle; rect: TourRect } | null> {
  for (const handle of [...handles].reverse()) {
    const rect = await handle.measure();
    if (rect) return { handle, rect };
  }
  return null;
}

/** Within a point: the same place, so the light doesn't redraw for nothing. */
function sameRect(a: TourRect, b: TourRect): boolean {
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

/** The window's size now, not as of the last render (a timer reads it). */
function windowNow(): { width: number; height: number } {
  return Dimensions.get('window');
}

function frames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)));
    tick(n);
  });
}
