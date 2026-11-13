import { wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { loadAway } from '@/api/away';
import { loadHouse } from '@/api/board';
import { loadJohnList } from '@/api/settings';
import { useHouse } from '@/hooks/use-house';
import { snapshot } from '@/testing/house';
import { BATH, BINS, renderPages } from '@/testing/pages';

import { SetupSection } from './setup-section';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/away', () => ({ loadAway: jest.fn() }));
jest.mock('@/api/draft', () => ({
  askUsageOf: jest.fn(async () => ({ left: 0.62, house: false, limit: 'mine', resetsAt: '2026-11-09T00:00:00.000Z', pass: true, people: 2, houseUsed: 0.3, mineUsed: 0.38, usedBy: [] })),
}));
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/settings', () => ({ loadJohnList: jest.fn() }));
jest.mock('@/api/supabase', () => ({ supabase: {} }));

/** House setup on its own, once the house is read, with the pages it leads to standing in as their names. */
async function open({ kid = false } = {}) {
  function Host() {
    const { view } = useHouse('h1', 'priya');
    return view ? <SetupSection houseId="h1" userId="priya" view={view} kid={kid} /> : null;
  }
  await renderPages(
    {
      'house/index': Host,
      'house/johns': () => <Text>John list page</Text>,
      'house/rules': () => <Text>Rules page</Text>,
      'house/away': () => <Text>Days and time away page</Text>,
    },
    '/house',
  );
  await screen.findByTestId('setup-section');
}

/** A row's text, once what it reads has come in. */
async function rowSays(testID: string, text: RegExp) {
  await waitFor(() => expect(screen.getByTestId(testID)).toHaveTextContent(text));
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [BINS, BATH], groups: [] });
  (loadAway as jest.Mock).mockResolvedValue({
    today: '2026-10-26',
    periods: [{ id: 'w1', userId: 'sam', startsOn: '2026-10-29', endsOn: '2026-11-01', note: null }],
  });
});

it('says it affects everyone, under its label', async () => {
  await open();
  const section = within(screen.getByTestId('setup-section'));
  expect(section.getByRole('header', { name: words('common.shell.setup') })).toBeOnTheScreen();
  expect(section.getByText(words('house.lower.setupNote'))).toBeOnTheScreen();
});

it("is a kid's to read: how the family runs, set by their parents, without Ask Jonz's usage", async () => {
  await open({ kid: true });
  const section = within(screen.getByTestId('setup-section'));
  expect(section.getByRole('header', { name: words('house.kid.setup') })).toBeOnTheScreen();
  expect(section.getByText(words('house.kid.setupNote'))).toBeOnTheScreen();
  expect(section.getAllByRole('link')).toHaveLength(3);
  expect(screen.queryByTestId('to-ask-usage')).toBeNull();
});

it('shows what each page is set to now', async () => {
  await open();
  // The bins every week (1) and the bathroom every other (4 / 2).
  await rowSays('to-johns', /Johns.*2 Johns, about 3 pts a week/);
  expect(screen.getByTestId('to-rules')).toHaveTextContent(/Rules.*£20 stake, £1 late, £3 missed/);
  await rowSays('to-away', new RegExp(`${words('house.lower.away')}.*Sam, 29 Oct–1 Nov`));
});

it('leaves Groups and the admins to the pages they are on now, and has no History', async () => {
  await open();
  await rowSays('to-johns', /2 Johns,/);
  expect(within(screen.getByTestId('setup-section')).getAllByRole('link')).toHaveLength(4);
  for (const id of ['to-groups', 'to-admins', 'to-history']) expect(screen.queryByTestId(id)).toBeNull();
});

it('keeps each row as tall while it reads as once it has, so nothing below moves', async () => {
  (loadJohnList as jest.Mock).mockReturnValue(new Promise(() => undefined));
  (loadAway as jest.Mock).mockReturnValue(new Promise(() => undefined));
  await open();
  for (const id of ['to-johns', 'to-rules', 'to-away']) {
    expect(screen.getByTestId(id)).toHaveStyle({ minHeight: 64 });
  }
  expect(screen.getByTestId('to-johns')).toHaveTextContent(/^Johns$/);
});

it("says nobody's away when nobody is, and none yet before there are Johns", async () => {
  (loadJohnList as jest.Mock).mockResolvedValue({ johns: [], groups: [] });
  (loadAway as jest.Mock).mockResolvedValue({ today: '2026-10-26', periods: [] });
  await open();
  await rowSays('to-johns', new RegExp(words('house.lower.noJohns')));
  await rowSays('to-away', new RegExp(words('house.lower.nobodyAway')));
});

it.each([
  ['to-johns', '/house/johns', 'John list page'],
  ['to-rules', '/house/rules', 'Rules page'],
  ['to-away', '/house/away', 'Days and time away page'],
])('%s leads to its page', async (testID, path, page) => {
  await open();
  await fireEvent.press(within(screen.getByTestId(testID)).getByRole('link'));
  expect(screen).toHavePathname(path);
  expect(screen.getByText(page)).toBeOnTheScreen();
});

it("shows what's left of your Ask Jonz this week and opens the usage page", async () => {
  await open();
  await rowSays('to-ask-usage', /62% of yours left this week/);
});
