import { TOUR_COPY, TOURS, type TourFacts } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import { saveToursSaved } from '@/api/tours';
import { useTour } from '@/components/tour/tour-context';
import { TourProvider } from '@/components/tour/tour-provider';
import { TourSpot } from '@/components/tour/tour-spot';
import { testQueryClient } from '@/testing/query';

// Every host view's measureInWindow, as react-native's jest setup mocks it: one jest.fn they share.
const { measureInWindow } = jest.requireActual<{ default: { measureInWindow: jest.Mock } }>(
  '@react-native/jest-preset/jest/MockNativeMethods',
).default;

let mockPath = '/today';
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  usePathname: () => mockPath,
  router: { navigate: jest.fn(), push: jest.fn() },
}));
jest.mock('@/api/tours', () => ({ saveToursSaved: jest.fn(async () => undefined) }));
jest.mock('@/api/reports', () => ({ myReports: jest.fn(async () => []), sendReport: jest.fn(), pickScreenshot: jest.fn() }));
let mockMeta: Record<string, unknown> = {};
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({
    session: { user: { id: 'ava', user_metadata: mockMeta, created_at: '2026-10-30T09:00:00Z' } },
    house: { id: 'h1', name: 'Bin Street' },
  }),
}));

const facts: TourFacts = { admin: false, wide: false, toCheck: true, hasJohns: true };

/** A pretend Today: every spot Today's tour lights, and a button that starts it. */
function Today({ only }: { only?: string[] }) {
  const tours = useTour();
  const spots = ['today.nextUp', 'today.needsYou', 'today.rest', 'shell.tabs', 'shell.help'] as const;
  return (
    <>
      {spots
        .filter((id) => !only || only.includes(id))
        .map((id) => (
          <TourSpot key={id} id={id}>
            <Text>{id}</Text>
          </TourSpot>
        ))}
      <Text onPress={() => tours?.start('today')}>start</Text>
      <Text onPress={() => tours?.openHelp()}>help</Text>
    </>
  );
}

async function show(only?: string[], given: TourFacts = facts) {
  await render(
    <QueryClientProvider client={testQueryClient()}>
      <TourProvider facts={given}>
        <Today only={only} />
      </TourProvider>
    </QueryClientProvider>,
  );
}

/** Lets the player find the spot: its measuring and its two frames. */
async function settle() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(200);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockPath = '/today';
  mockMeta = {};
  measureInWindow.mockImplementation((place: (x: number, y: number, w: number, h: number) => void) => place(16, 120, 358, 140));
});
afterEach(() => {
  measureInWindow.mockReset();
  jest.useRealTimers();
  jest.clearAllMocks();
});

it('walks a tour a step at a time: the count, Back, and Done on the last', async () => {
  await show();
  await fireEvent.press(screen.getByText('start'));
  await settle();
  const steps = TOURS.today.steps;
  expect(screen.getByText(steps[0].title)).toBeTruthy();
  expect(screen.getByTestId('tour-count')).toHaveTextContent('1 of 5');
  expect(screen.queryByTestId('tour-back')).toBeNull();

  await fireEvent.press(screen.getByTestId('tour-next'));
  await settle();
  expect(screen.getByText(steps[1].title)).toBeTruthy();
  expect(screen.getByTestId('tour-count')).toHaveTextContent('2 of 5');

  await fireEvent.press(screen.getByTestId('tour-back'));
  await settle();
  expect(screen.getByText(steps[0].title)).toBeTruthy();

  for (let i = 0; i < 4; i++) {
    await fireEvent.press(screen.getByTestId('tour-next'));
    await settle();
  }
  expect(screen.getByTestId('tour-count')).toHaveTextContent('5 of 5');
  expect(screen.getByTestId('tour-next')).toHaveTextContent(TOUR_COPY.done);
  // No Skip on the last step: Done is the way out.
  expect(screen.queryByTestId('tour-skip')).toBeNull();
  await fireEvent.press(screen.getByTestId('tour-next'));
  expect(screen.queryByTestId('tour')).toBeNull();
  expect(saveToursSaved).toHaveBeenCalledWith({ seen: ['today'], offerDone: true });
});

it('leaves out the steps the facts rule out, so the count is what you see', async () => {
  await show(undefined, { ...facts, toCheck: false, hasJohns: false });
  await fireEvent.press(screen.getByText('start'));
  await settle();
  expect(screen.getByTestId('tour-count')).toHaveTextContent('1 of 3');
});

it("leaves out a spot that isn't drawn on the page you're on, so the count is what you see", async () => {
  await show(['today.nextUp', 'shell.tabs', 'shell.help']);
  await fireEvent.press(screen.getByText('start'));
  await settle();
  expect(screen.getByTestId('tour-count')).toHaveTextContent('1 of 3');
  await fireEvent.press(screen.getByTestId('tour-next'));
  await settle();
  expect(screen.getByText(TOURS.today.steps[3].title)).toBeTruthy();
});

it('passes over a step whose spot never shows on another page, rather than dimming nothing', async () => {
  // Started from Week: Today's spots are looked for once it opens.
  mockPath = '/week';
  await show(['today.nextUp', 'shell.tabs', 'shell.help']);
  await fireEvent.press(screen.getByText('start'));
  await settle();
  await fireEvent.press(screen.getByTestId('tour-next'));
  // Needs you and the rest of the week aren't there: after a wait, the tabs.
  // Each pass-over is its own wait: React draws the next step once an act ends.
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
  }
  expect(screen.getByText(TOURS.today.steps[3].title)).toBeTruthy();
});

it('Skip ends it and saves it as seen', async () => {
  await show();
  await fireEvent.press(screen.getByText('start'));
  await settle();
  await fireEvent.press(screen.getByTestId('tour-skip'));
  expect(screen.queryByTestId('tour')).toBeNull();
  expect(saveToursSaved).toHaveBeenCalledWith({ seen: ['today'], offerDone: true });
});

it("opens the step's page first when it isn't the one showing", async () => {
  mockPath = '/house';
  await show();
  await fireEvent.press(screen.getByText('start'));
  expect(router.navigate).toHaveBeenCalledWith('/today');
});

it('lights the spot with the card under it on a phone', async () => {
  await show();
  await fireEvent.press(screen.getByText('start'));
  await settle();
  // The spot at 16,120 358×140, lit 8 round it; the card 12 under that.
  expect(screen.getByTestId('tour-ring', { includeHiddenElements: true })).toHaveStyle({ left: 8, top: 112, width: 374, height: 156 });
  expect(screen.getByTestId('tour-card')).toHaveStyle({ top: 112 + 156 + 12 });
});

describe('the Help sheet', () => {
  it("offers the page's tour first, the others as guides, and the ways to report", async () => {
    mockMeta = { tours: { seen: ['week'], offerDone: true } };
    await show();
    await fireEvent.press(screen.getByText('help'));
    expect(screen.getByTestId('help-tour-here')).toHaveTextContent(TOURS.today.title);
    expect(screen.getByTestId('help-tour-week')).toHaveTextContent(new RegExp(TOUR_COPY.seen));
    expect(screen.getByTestId('help-tour-house')).toBeTruthy();
    // The admins' tour is for admins.
    expect(screen.queryByTestId('help-tour-setUp')).toBeNull();
    expect(screen.getByTestId('help-report')).toBeTruthy();
    expect(screen.getByTestId('help-reports')).toBeTruthy();
  });

  it("lists the admins' tour for an admin, and no page tour off the tabs", async () => {
    mockPath = '/house/johns';
    await show(undefined, { ...facts, admin: true });
    await fireEvent.press(screen.getByText('help'));
    expect(screen.queryByTestId('help-tour-here')).toBeNull();
    expect(screen.getByTestId('help-tour-setUp')).toBeTruthy();
  });

  it('changes its own content to the report form', async () => {
    await show();
    await fireEvent.press(screen.getByText('help'));
    await fireEvent.press(screen.getByTestId('help-report'));
    expect(screen.queryByTestId('help-tour-here')).toBeNull();
    expect(screen.getByText('Report a problem')).toBeTruthy();
  });
});
