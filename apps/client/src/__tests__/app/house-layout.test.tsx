import { FOCUS_SHELL_COPY, HOUSE_LOWER_COPY, SECTION_LABEL } from '@app/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { Link, router, Slot } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { loadHouse } from '@/api/board';
import HouseLayout from '@/app/(house)/_layout';
import HouseStack, { unstable_settings as houseStackSettings } from '@/app/(house)/house/_layout';
import { TitleBar } from '@/components/title-bar';
import { assignment, snapshot } from '@/testing/house';
import { testQueryClient } from '@/testing/query';

// The real house layout (the tabs, the rail, the live channel, the John
// sheet and the toasts) and House's own stack, with stand-in screens.
jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
// What the John sheet can do, which the layout mounts.
jest.mock('@/api/disputes', () => ({ castVote: jest.fn(), raiseDispute: jest.fn() }));
jest.mock('@/api/johns', () => ({ markDone: jest.fn(), undoDone: jest.fn(), spendImmunity: jest.fn() }));
jest.mock('@/api/photos', () => ({ pickPhoto: jest.fn(), uploadProof: jest.fn() }));
jest.mock('@/api/resets', () => ({ previewReset: jest.fn(), applyReset: jest.fn() }));
jest.mock('@/api/reports', () => ({ myReports: jest.fn(async () => []), sendReport: jest.fn(), pickScreenshot: jest.fn() }));
jest.mock('@/api/tours', () => ({ saveToursSaved: jest.fn(async () => undefined) }));
jest.mock('@/api/supabase', () => {
  const mockChannel = { on: jest.fn(), subscribe: jest.fn() };
  mockChannel.on.mockReturnValue(mockChannel);
  mockChannel.subscribe.mockReturnValue(mockChannel);
  return {
    supabase: {
      auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
      realtime: { setAuth: jest.fn() },
      channel: jest.fn(() => mockChannel),
      removeChannel: jest.fn(),
    },
  };
});
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));
// The chat with Jonz itself, which the side panel holds from laptop width.
jest.mock('@/components/house/ask-jonz', () => ({
  AskJonz: ({ bar }: { bar: (title: string) => React.ReactNode }) => {
    const { Text: Words, View: Box } = jest.requireActual('react-native');
    return (
      <Box>
        {bar('Ask Jonz')}
        <Words>Chat with Jonz</Words>
      </Box>
    );
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 412, height: 915, scale: 1, fontScale: 1 })),
}));

/** A pushed page as the real ones are: a title bar with back, then its words. */
function Pushed({ name }: { name: string }) {
  return (
    <View>
      <TitleBar title={name} back="/house" backLabel={SECTION_LABEL.house} />
      <Text>{`${name} screen`}</Text>
    </View>
  );
}

async function open(url = '/today') {
  const client = testQueryClient();
  await renderRouter(
    {
      _layout: () => (
        <QueryClientProvider client={client}>
          <Slot />
        </QueryClientProvider>
      ),
      '(house)/_layout': HouseLayout,
      '(house)/today': () => (
        <View>
          <Text>Today screen</Text>
          <Link href="/house/describe">Describe your house</Link>
          <Link href="/house/stake">To the Stake</Link>
        </View>
      ),
      '(house)/week': () => (
        <View>
          <TitleBar title="Week" ask />
          <Text>Week screen</Text>
        </View>
      ),
      // As the module is, so the anchor under a page opened from a link applies.
      '(house)/house/_layout': { default: HouseStack, unstable_settings: houseStackSettings },
      '(house)/house/index': () => (
        <View>
          <Text>House screen</Text>
          <Link href="/house/wall">To the Wall</Link>
        </View>
      ),
      '(house)/house/wall': () => <Pushed name="Wall" />,
      '(house)/house/stake': () => <Pushed name="Stake" />,
      '(house)/house/johns': () => <Pushed name="Johns" />,
      // As the chat is once its Johns are added: a row on to the John list.
      '(house)/house/describe': () => (
        <View>
          <Pushed name="Describe" />
          <Text onPress={() => router.dismissTo('/house/johns')}>Open the list</Text>
        </View>
      ),
    },
    { initialUrl: url },
  );
}

/** A dispute on Sam's tick that Priya hasn't voted on yet. */
function waitingForPriya() {
  return snapshot({
    assignments: [
      ...snapshot().assignments.slice(0, 3),
      assignment({ id: 'a4', user_id: 'sam', name: 'Clean the bath', done_at: new Date(Date.now() - 3_600_000).toISOString() }),
    ],
    disputes: [
      {
        id: 'd1',
        assignment_id: 'a4',
        raised_by: 'cal',
        reason: 'Ring round the bath',
        closes_at: new Date(Date.now() + 3_600_000).toISOString(),
        dispute_votes: [{ user_id: 'cal', uphold: true }],
      },
    ],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
});

describe('on a phone', () => {
  it('has a tab for each of the three places, and moves between them', async () => {
    await open();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByText('Today screen')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: SECTION_LABEL.today })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: SECTION_LABEL.week }));
    expect(screen).toHavePathname('/week');
    expect(screen.getByText('Week screen')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: SECTION_LABEL.week })).toBeSelected();
    expect(screen.getByRole('tab', { name: SECTION_LABEL.today })).not.toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: SECTION_LABEL.house }));
    expect(screen).toHavePathname('/house');
    expect(screen.getByText('House screen')).toBeOnTheScreen();
  });

  it('has no Wall, Table or Stake tab, and no wordmark strip', async () => {
    await open();
    for (const gone of [SECTION_LABEL.wall, SECTION_LABEL.table, SECTION_LABEL.stake]) {
      expect(screen.queryByRole('tab', { name: gone })).toBeNull();
    }
    expect(screen.queryByLabelText('Jonz')).toBeNull();
  });

  it("counts the disputes waiting for your vote on Today's tab, and says so", async () => {
    (loadHouse as jest.Mock).mockResolvedValue(waitingForPriya());
    await open('/week');
    const today = await screen.findByRole('tab', { name: FOCUS_SHELL_COPY.tab(SECTION_LABEL.today, 1) });
    // The badge itself is silent: the tab's name says it.
    expect(within(today).getByTestId('count-badge', { includeHiddenElements: true })).toHaveTextContent('1');
    // The other tabs have nothing to count.
    expect(screen.queryAllByTestId('count-badge', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('shows no badge when nothing waits for your vote', async () => {
    await open();
    expect(await screen.findByRole('tab', { name: SECTION_LABEL.today })).toBeOnTheScreen();
    expect(screen.queryByTestId('count-badge', { includeHiddenElements: true })).toBeNull();
  });

  it("keeps the tabs on a page House pushes, and its back goes to House", async () => {
    await open('/house');
    await fireEvent.press(screen.getByRole('link', { name: 'To the Wall' }));
    expect(screen).toHavePathname('/house/wall');
    expect(screen.getByText('Wall screen')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: SECTION_LABEL.house })).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) }));
    expect(screen).toHavePathname('/house');
    expect(screen.getByText('House screen')).toBeOnTheScreen();
  });

  it('puts House under a page opened straight from a link, so back has somewhere to go', async () => {
    await open('/house/stake');
    expect(screen.getByText('Stake screen')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: SECTION_LABEL.house })).toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) }));
    expect(screen).toHavePathname('/house');
  });

  it('goes back to House, not Today, from a House page opened from Today', async () => {
    await open('/today');
    await fireEvent.press(screen.getByRole('link', { name: 'To the Stake' }));
    expect(screen).toHavePathname('/house/stake');
    await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) }));
    expect(screen).toHavePathname('/house');
    expect(screen.getByText('House screen')).toBeOnTheScreen();
  });

  it('goes back to House from the John list the describe chat opens', async () => {
    await open('/today');
    await fireEvent.press(screen.getByRole('link', { name: 'Describe your house' }));
    expect(screen).toHavePathname('/house/describe');
    await fireEvent.press(screen.getByText('Open the list'));
    expect(screen).toHavePathname('/house/johns');
    await fireEvent.press(screen.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) }));
    expect(screen).toHavePathname('/house');
    expect(screen.getByText('House screen')).toBeOnTheScreen();
  });

  it("takes House's tab back to the top of its stack", async () => {
    await open('/house');
    await fireEvent.press(screen.getByRole('link', { name: 'To the Wall' }));
    expect(screen).toHavePathname('/house/wall');
    await fireEvent.press(screen.getByRole('tab', { name: SECTION_LABEL.house }));
    // The stack pops on the next frame, once every listener has had the press.
    await waitFor(() => expect(screen).toHavePathname('/house'));
    expect(screen.getByText('House screen')).toBeOnTheScreen();
  });
});

describe('the sparkles', () => {
  it('open the chat as a page on a phone', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 412, height: 915, scale: 1, fontScale: 1 });
    await open('/week');
    await fireEvent.press(screen.getByTestId('ask-jonz'));
    expect(screen).toHavePathname('/house/describe');
    expect(screen.queryByTestId('ask-panel')).toBeNull();
  });

  it('open and close the chat beside the page on a laptop', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
    await open('/week');
    const look = () => StyleSheet.flatten(screen.getByTestId('ask-jonz').props.style);
    const shut = look();
    await fireEvent.press(screen.getByTestId('ask-jonz'));
    expect(screen).toHavePathname('/week');
    expect(within(screen.getByTestId('ask-panel')).getByText('Chat with Jonz')).toBeOnTheScreen();
    // The open panel is the sign: the sparkles look the same, and say they're expanded.
    expect(screen.getByTestId('ask-jonz')).toBeExpanded();
    expect(look()).toEqual(shut);
    expect(screen.getByText('Week screen')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('ask-close'));
    expect(screen.queryByTestId('ask-panel')).toBeNull();
    // The sparkles close it too.
    await fireEvent.press(screen.getByTestId('ask-jonz'));
    await fireEvent.press(screen.getByTestId('ask-jonz'));
    expect(screen.queryByTestId('ask-panel')).toBeNull();
  });
});

describe('on a laptop', () => {
  beforeEach(() => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
  });

  it('has a rail with the house above the same three places', async () => {
    await open('/week');
    expect(await screen.findByText('2 housemates')).toBeOnTheScreen();
    expect(screen.getByText('Flat 3')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: SECTION_LABEL.week })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: SECTION_LABEL.house }));
    expect(screen).toHavePathname('/house');
  });

  it("counts the disputes waiting for your vote beside Today", async () => {
    (loadHouse as jest.Mock).mockResolvedValue(waitingForPriya());
    await open('/week');
    const today = await screen.findByRole('tab', { name: FOCUS_SHELL_COPY.tab(SECTION_LABEL.today, 1) });
    expect(within(today).getByTestId('count-badge', { includeHiddenElements: true })).toHaveTextContent('1');
  });
  it("lists House's pages beside them, the one you're on marked, and no way back on the page", async () => {
    await open('/house');
    const nav = await screen.findByTestId('house-nav');
    expect(within(nav).getByRole('link', { name: HOUSE_LOWER_COPY.overview })).toHaveProp('aria-current', 'page');
    await fireEvent.press(within(nav).getByRole('link', { name: HOUSE_LOWER_COPY.johns }));
    expect(screen).toHavePathname('/house/johns');
    expect(screen.getByText('Johns screen')).toBeOnTheScreen();
    expect(within(nav).getByRole('link', { name: HOUSE_LOWER_COPY.johns })).toHaveProp('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: HOUSE_LOWER_COPY.overview })).not.toHaveProp('aria-current', 'page');
    expect(screen.queryByTestId('back')).toBeNull();
  });

  it("moves between House's pages without piling them up, and Overview goes back to the top", async () => {
    await open('/house/wall');
    const nav = await screen.findByTestId('house-nav');
    await fireEvent.press(within(nav).getByRole('link', { name: HOUSE_LOWER_COPY.johns }));
    expect(screen).toHavePathname('/house/johns');
    await fireEvent.press(within(nav).getByRole('link', { name: HOUSE_LOWER_COPY.overview }));
    expect(screen).toHavePathname('/house');
    expect(screen.getByText('House screen')).toBeOnTheScreen();
  });

  it("keeps the phone's way in a window too narrow for the list", async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1100, height: 900, scale: 1, fontScale: 1 });
    await open('/house/wall');
    await screen.findByText('Wall screen');
    expect(screen.queryByTestId('house-nav')).toBeNull();
    expect(screen.getByTestId('back')).toBeOnTheScreen();
  });

  it('puts the list away when something beside it takes the room', async () => {
    await open('/house/wall');
    expect(await screen.findByTestId('house-nav')).toBeOnTheScreen();
    // The House tab measured narrower than the list and a page need (the chat with Jonz open beside it).
    await fireEvent(screen.getByTestId('house-workspace'), 'layout', { nativeEvent: { layout: { width: 808, height: 900 } } });
    expect(screen.queryByTestId('house-nav')).toBeNull();
    expect(screen.getByTestId('back')).toBeOnTheScreen();
  });

  it('lists nothing beside Today or Week', async () => {
    await open('/week');
    await screen.findByText('Week screen');
    expect(screen.queryByTestId('house-nav')).toBeNull();
  });
});
