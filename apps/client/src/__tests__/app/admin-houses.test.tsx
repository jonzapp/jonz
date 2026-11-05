import { OVERVIEW_COPY, type HouseDetail, type HouseRow, type Overview } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { housesCount, housesPage, ownerHouse, ownerOverview } from '@/api/houses';
import { liveNotices, ownerStatus } from '@/api/owner';
import AdminLayout from '@/app/admin/_layout';
import HousePage from '@/app/admin/houses/[id]';
import HousesPage from '@/app/admin/houses/index';
import MorePage from '@/app/admin/more';
import OverviewPage from '@/app/admin/overview';
import { renderPages, untilRead } from '@/testing/pages';

jest.mock('@/api/owner', () => ({ ownerStatus: jest.fn(), liveNotices: jest.fn() }));
jest.mock('@/api/houses', () => ({
  ...jest.requireActual<typeof import('@/api/houses')>('@/api/houses'),
  ownerOverview: jest.fn(),
  housesPage: jest.fn(),
  housesCount: jest.fn(),
  ownerHouse: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/http', () => ({ apiPost: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'owner' } }, house: null, refresh: jest.fn() }),
}));

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const ROUTES = {
  'admin/_layout': AdminLayout,
  'admin/overview': OverviewPage,
  'admin/houses/index': HousesPage,
  'admin/houses/[id]': HousePage,
  'admin/more': MorePage,
};

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const daysOn = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

const ELM: HouseRow = {
  id: 'h1',
  name: 'Elm Street',
  joinCode: 'K7P2QX',
  people: 5,
  passPlan: 'yearly',
  passUntil: daysOn(300),
  lastActive: minutesAgo(2),
  onTime: 37,
  settled: 50,
  createdAt: '2026-09-12T10:00:00Z',
  sortAt: minutesAgo(2),
};
const FLAT: HouseRow = { ...ELM, id: 'h2', name: 'Flat 4B', people: 3, passPlan: 'trial', passUntil: daysOn(-2), lastActive: null, settled: 0, onTime: 0 };

const ELM_DETAIL: HouseDetail = {
  id: 'h1',
  name: 'Elm Street',
  joinCode: 'K7P2QX',
  createdAt: '2026-09-03T10:00:00Z',
  firstDealtAt: '2026-09-04T10:00:00Z',
  timezone: 'Europe/London',
  currency: 'GBP',
  dealMode: 'smart',
  passPlan: 'yearly',
  passUntil: '2027-09-03T00:00:00Z',
  passBuyer: 'Priya',
  billed: true,
  lastActive: minutesAgo(2),
  johns: 9,
  people: [
    { id: 'p', name: 'Priya', role: 'admin', joinedAt: '', movingOutOn: null, onTime: 6, settled: 7, awayUntil: null },
    { id: 'j', name: 'Jo', role: 'member', joinedAt: '', movingOutOn: null, onTime: 1, settled: 2, awayUntil: '2026-11-02' },
  ],
};

const OVERVIEW: Overview = {
  days: 7,
  houses: 128,
  housesNew: 12,
  housesNewBefore: 3,
  people: 412,
  inHouses: 410,
  active: 110,
  passes: { monthly: 10, yearly: 20, founding: 7, trial: 40 },
  onTime: { onTime: 900, late: 150, missed: 62 },
  ask: { turns: 1210, failed: 0 },
  weeks: Array.from({ length: 10 }, (_, i) => ({ ends: daysOn(-7 * (9 - i)), active: 40 + i * 8 })),
  clock: minutesAgo(4),
  reports: 2,
  needs: [{ kind: 'report', id: 'r1', name: 'Sam', words: 'Charged twice', house: 'The Annexe', at: minutesAgo(120) }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue(PHONE);
  jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true });
  jest.mocked(liveNotices).mockResolvedValue([]);
  jest.mocked(ownerOverview).mockResolvedValue({ overview: OVERVIEW, ms: 120 });
  jest.mocked(housesPage).mockResolvedValue({ items: [ELM, FLAT], more: false });
  jest.mocked(housesCount).mockResolvedValue(2);
  jest.mocked(ownerHouse).mockResolvedValue(ELM_DETAIL);
});

describe('Overview', () => {
  it('leads with what needs you, then how things are, the figures and the chart', async () => {
    await renderPages(ROUTES, '/admin/overview');
    await untilRead();
    expect(within(screen.getByTestId('overview-needs')).getByTestId('need-r1')).toHaveTextContent(/Sam wrote in.*Charged twice, The Annexe, 2 h ago/);
    expect(screen.getByTestId('overview-inbox')).toHaveTextContent(OVERVIEW_COPY.openInbox(2));
    expect(screen.getByTestId('health-database')).toHaveTextContent(/Database.*120 ms.*Up/);
    expect(screen.getByTestId('health-clock')).toHaveTextContent(/The clock.*ticked 4 min ago.*Up/);
    expect(screen.getByTestId('figure-houses')).toHaveTextContent(/128.*Houses.*12 new, up 9 on last week/);
    expect(screen.getByTestId('figure-onTime')).toHaveTextContent(/81%.*Johns on time.*212 late or missed/);
    expect(screen.getByTestId('overview-chart')).toBeVisible();
    expect(screen.getByTestId('admin-tab-overview')).toBeSelected();
  });

  it('reads the last 30 days when asked, and says the clock is late after half an hour', async () => {
    jest.mocked(ownerOverview).mockResolvedValue({ overview: { ...OVERVIEW, clock: minutesAgo(50) }, ms: 120 });
    await renderPages(ROUTES, '/admin/overview');
    await untilRead();
    expect(screen.getByTestId('health-clock')).toHaveTextContent(/Late/);
    await fireEvent.press(within(screen.getByTestId('overview-days')).getByText(OVERVIEW_COPY.windows[30]));
    await waitFor(() => expect(ownerOverview).toHaveBeenLastCalledWith(30));
  });

  it('says nothing needs you when nothing does', async () => {
    jest.mocked(ownerOverview).mockResolvedValue({ overview: { ...OVERVIEW, needs: [], reports: 0 }, ms: 80 });
    await renderPages(ROUTES, '/admin/overview');
    await untilRead();
    expect(screen.getByText(OVERVIEW_COPY.nothingNeeds)).toBeVisible();
  });
});

describe('Houses', () => {
  it('lists every house on a phone with one line each, and a house opens as its own page', async () => {
    await renderPages(ROUTES, '/admin/houses');
    await untilRead();
    expect(screen.getByTestId('house-h1')).toHaveTextContent(/Elm Street.*5 people, Pass, active 2 min ago, 74% on time/);
    expect(screen.getByTestId('house-h2')).toHaveTextContent(/Flat 4B.*3 people, None, never/);
    await fireEvent.press(screen.getByTestId('house-h1'));
    expect(await screen.findByTestId('admin-house')).toBeVisible();
    await waitFor(() => expect(ownerHouse).toHaveBeenCalledWith('h1'));
    expect(await screen.findByTestId('house-pass')).toHaveTextContent(/House Pass, yearly.*Priya pays, renews 3 Sep 2027/);
    expect(screen.getByTestId('house-person-p')).toHaveTextContent(/Priya.*admin, 6 of 7 on time/);
    expect(screen.getByTestId('house-person-j')).toHaveTextContent(/Jo.*away until 2 Nov/);
    expect(screen.getByText('Started 3 Sep, Priya is the admin')).toBeVisible();
  });

  it('is a busy list: the database finds houses by words and filters by Pass', async () => {
    await renderPages(ROUTES, '/admin/houses');
    await untilRead();
    expect(housesPage).toHaveBeenLastCalledWith(null, { q: '', pass: null, active: null, after: null, before: null });
    const box = screen.getByLabelText('House, person, email or join code');
    await fireEvent(box, 'focus');
    await fireEvent.changeText(box, 'paid');
    await fireEvent.press(screen.getByTestId('houses-search-suggestion-pass-paid'));
    await waitFor(() => expect(housesPage).toHaveBeenLastCalledWith(null, expect.objectContaining({ pass: 'paid', q: '' })));
    expect(housesCount).toHaveBeenLastCalledWith(expect.objectContaining({ pass: 'paid' }));
  });

  it('shows a table on a laptop with the first house beside it', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/houses');
    await untilRead();
    expect(screen.getByTestId('house-h1')).toHaveTextContent(/Elm Street.*5.*Pass.*2 min ago.*74%.*12 Sep/);
    expect(screen.getByTestId('house-h2')).toHaveTextContent(/Flat 4B.*3.*None.*Never.*None due/);
    expect(await screen.findByTestId('house-panel')).toHaveTextContent(/Elm Street/);
    expect(screen.getByTestId('admin-nav-houses')).toBeSelected();
  });
});

describe('More, on a phone', () => {
  it('holds the pages without a tab', async () => {
    await renderPages(ROUTES, '/admin/more');
    await untilRead();
    for (const key of ['messages', 'deletions', 'audit']) expect(screen.getByTestId(`admin-more-${key}`)).toBeVisible();
    expect(screen.getByTestId('admin-tab-more')).toBeSelected();
  });
});
