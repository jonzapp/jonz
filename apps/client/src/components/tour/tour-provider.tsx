import {
  markTourSeen,
  readToursSaved,
  tourSteps,
  type TourFacts,
  type TourId,
  type TourPage,
  type TourRect,
  type TourSpotId,
  type TourStep,
  type ToursSaved,
} from '@app/core';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { saveToursSaved } from '@/api/tours';
import { HelpSheet } from '@/components/tour/help-sheet';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { TourContext, type TourControls } from '@/components/tour/tour-context';
import { SpotRegistryContext, type SpotHandle, type SpotRegistry } from '@/components/tour/tour-spot';
import { useMembership } from '@/hooks/use-membership';

/** How long a step waits for its spot to show (a page to open, a read to land) before it's passed over. */
const FIND_FOR = 2500;
const FIND_EVERY = 100;

type Running = { id: TourId; steps: (TourStep & { page: TourPage })[]; index: number };

const trimmed = (path: string) => path.replace(/\/+$/, '') || '/';

/**
 * Plays tours, and holds the Help sheet that starts them. Mounted once in
 * the house layout, round every tab, like the John sheet: a tour can walk
 * across pages. `facts` (an admin? a laptop? anything to check?) decide
 * which steps a tour shows, read when it starts.
 *
 * Spots sign in as they mount (TourSpot). For each step the player opens
 * the step's page if it isn't the one showing, waits for the spot to show,
 * scrolls it into view and lights it; a spot that doesn't show within
 * FIND_FOR is passed over. Finishing or skipping saves the tour as seen on
 * your account, so the offer on Today goes, and the Help sheet marks it.
 */
export function TourProvider({ facts, children }: { facts: TourFacts; children: ReactNode }) {
  const { session } = useMembership();
  const pathname = usePathname();
  const window = useWindowDimensions();
  const spots = useRef(new Map<TourSpotId, SpotHandle[]>());
  const [running, setRunning] = useState<Running | null>(null);
  const [rect, setRect] = useState<TourRect | null>(null);
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
      const steps = tourSteps(id, facts).filter((s) => s.page !== here || (spots.current.get(s.spot)?.length ?? 0) > 0);
      if (steps.length === 0) return;
      setRect(null);
      setRunning({ id, steps, index: 0 });
    },
    [facts, pathname],
  );

  const move = useCallback(
    (by: 1 | -1) => {
      if (!running) return;
      const index = running.index + by;
      if (index < 0) return;
      if (index >= running.steps.length) return finish(running.id);
      setRect(null);
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
    const look = async (): Promise<void> => {
      if (!live) return;
      const found = await showing(spots.current.get(step.spot) ?? []);
      if (!live) return;
      if (found) {
        found.handle.reveal();
        // Once the scroll has moved it, measure again where it ended up.
        await frames(2);
        const where = (await found.handle.measure()) ?? found.rect;
        if (live) setRect(where);
        return;
      }
      if (Date.now() - began >= FIND_FOR) {
        // Not on screen: pass it over rather than dim a page with nothing lit.
        move(1);
        return;
      }
      setTimeout(() => void look(), FIND_EVERY);
    };
    void look();
    return () => {
      live = false;
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

function frames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)));
    tick(n);
  });
}
