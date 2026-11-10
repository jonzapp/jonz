import { ADMIN_COPY, DELETE_HOUSE_COPY, HOUSES_COPY, OVERVIEW_COPY, OWNER_PERMISSION_NAMES, type HouseDetail, type HouseRow, type Overview } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { deleteHouse, housesCount, housesPage, ownerHouse, ownerOverview } from '@/api/houses';
import { liveNotices, ownerStatus } from '@/api/owner';
import AdminLayout from '@/app/admin/_layout';
import HousePage from '@/app/admin/houses/[id]';
import HousesPage from '@/app/admin/houses/index';
import DeletionsPage from '@/app/admin/deletions';
import OverviewPage from '@/app/admin/overview';
import { renderPages, untilRead } from '@/testing/pages';
import { wordsFor } from '@app/core';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/owner', () => ({
  ...jest.requireActual<typeof import('@/api/owner')>('@/api/owner'),
  ownerStatus: jest.fn(),
  liveNotices: jest.fn(),
  deletionsPage: jest.fn().mockResolvedValue({ people: [], more: false }),
  deletionsCount: jest.fn().mockResolvedValue(0),
}));
jest.mock('@/api/houses', () => ({
  ...jest.requireActual<typeof import('@/api/houses')>('@/api/houses'),
  ownerOverview: jest.fn(),
  housesPage: jest.fn(),
  housesCount: jest.fn(),
  ownerHouse: jest.fn(),
  deleteHouse: jest.fn(),
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
  'admin/deletions': DeletionsPage,
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
  kind: 'housemates',
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
  span: 'week',
  from: '2026-11-02T00:00:00Z',
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
  jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true, permissions: [...OWNER_PERMISSION_NAMES] });
  jest.mocked(liveNotices).mockResolvedValue([]);
  jest.mocked(ownerOverview).mockResolvedValue({ overview: OVERVIEW, ms: 120 });
  jest.mocked(housesPage).mockResolvedValue({ items: [ELM, FLAT], more: false, next: null });
  jest.mocked(housesCount).mockResolvedValue(2);
  jest.mocked(ownerHouse).mockResolvedValue(ELM_DETAIL);
});

describe('Overview', () => {
  it('leads with what needs you, then how things are, the figures and the chart', async () => {
    await renderPages(ROUTES, '/admin/overview');
    await untilRead(words);
    expect(within(screen.getByTestId('overview-needs')).getByTestId('need-r1')).toHaveTextContent(/Sam wrote in.*Charged twice, The Annexe, 2 h ago/);
    expect(screen.getByTestId('overview-inbox')).toHaveTextContent(OVERVIEW_COPY.openInbox(2));
    expect(screen.getByTestId('health-database')).toHaveTextContent(/Database.*120 ms.*Up/);
    expect(screen.getByTestId('health-clock')).toHaveTextContent(/The clock.*ticked 4 min ago.*Up/);
    expect(screen.getByTestId('figure-houses')).toHaveTextContent(/128.*Houses.*12 new, up 9 on last week/);
    expect(screen.getByTestId('figure-onTime')).toHaveTextContent(/81%.*Johns on time.*212 late or missed/);
    expect(screen.getByTestId('overview-chart')).toBeVisible();
    expect(screen.getByTestId('admin-tab-overview')).toBeSelected();
  });

  it('reads this month when asked, and says the clock is late after half an hour', async () => {
    jest.mocked(ownerOverview).mockResolvedValue({ overview: { ...OVERVIEW, clock: minutesAgo(50) }, ms: 120 });
    await renderPages(ROUTES, '/admin/overview');
    await untilRead(words);
    expect(screen.getByTestId('health-clock')).toHaveTextContent(/Late/);
    await fireEvent.press(within(screen.getByTestId('overview-span')).getByText(OVERVIEW_COPY.spans.month));
    await waitFor(() => expect(ownerOverview).toHaveBeenLastCalledWith('month', expect.any(String)));
  });

  it('says nothing needs you when nothing does', async () => {
    jest.mocked(ownerOverview).mockResolvedValue({ overview: { ...OVERVIEW, needs: [], reports: 0 }, ms: 80 });
    await renderPages(ROUTES, '/admin/overview');
    await untilRead(words);
    expect(screen.getByText(OVERVIEW_COPY.nothingNeeds)).toBeVisible();
  });
});

describe('Houses', () => {
  it('lists every house on a phone with one line each, and a house opens as its own page', async () => {
    await renderPages(ROUTES, '/admin/houses');
    await untilRead(words);
    expect(screen.getByTestId('house-h1')).toHaveTextContent(/Elm Street.*5 people, Pass, active 2 min ago, 74% on time/);
    expect(screen.getByTestId('house-h2')).toHaveTextContent(/Flat 4B.*3 people, None, never/);
    await fireEvent.press(screen.getByTestId('house-h1'));
    expect(await screen.findByTestId('admin-house')).toBeVisible();
    await waitFor(() => expect(ownerHouse).toHaveBeenCalledWith('h1'));
    expect(await screen.findByTestId('house-pass')).toHaveTextContent(/House Pass, yearly.*Priya pays, renews 3 Sep 2027/);
    expect(screen.getByTestId('house-person-p')).toHaveTextContent(/Priya.*admin, 6 of 7 on time/);
    expect(screen.getByTestId('house-person-j')).toHaveTextContent(/Jo.*away until 2 Nov/);
    expect(screen.getByText('Started 3 Sep, Priya is the admin')).toBeVisible();
    expect(screen.getByTestId('house-fact-kind')).toHaveTextContent(/Who lives here.*Housemates/);
  });

  it("names a family's parents and kids", async () => {
    jest.mocked(ownerHouse).mockResolvedValue({ ...ELM_DETAIL, kind: 'family' });
    await renderPages(ROUTES, '/admin/houses/h1');
    await untilRead(words);
    expect(await screen.findByText('Started 3 Sep, Priya is the parent')).toBeVisible();
    expect(screen.getByTestId('house-person-p')).toHaveTextContent(/Priya.*parent, 6 of 7 on time/);
    expect(screen.getByTestId('house-person-j')).toHaveTextContent(/Jo.*kid, away until 2 Nov/);
    expect(screen.getByTestId('house-fact-kind')).toHaveTextContent(/Who lives here.*A family/);
  });

  it('deletes a house only once its name is typed, telling everyone by default, then goes back to Houses', async () => {
    jest.mocked(deleteHouse).mockResolvedValue({ ok: true, name: 'Elm Street', people: 2, told: 2, passStopped: true });
    await renderPages(ROUTES, '/admin/houses/h1');
    await untilRead(words);
    await fireEvent.press(await screen.findByTestId('house-delete'));
    const sheet = within(await screen.findByTestId('house-delete-sheet'));
    expect(sheet.getByText(DELETE_HOUSE_COPY.title('Elm Street'))).toBeVisible();
    expect(sheet.getByTestId('house-delete-confirm')).toBeDisabled();
    await fireEvent.changeText(sheet.getByTestId('house-delete-reason'), 'Test house');
    await fireEvent.changeText(sheet.getByTestId('house-delete-name'), 'elm street');
    expect(sheet.getByTestId('house-delete-confirm')).toBeEnabled();
    await fireEvent.press(sheet.getByTestId('house-delete-confirm'));
    await waitFor(() => expect(deleteHouse).toHaveBeenCalledWith('h1', 'Test house', true));
    expect(await screen.findByText(DELETE_HOUSE_COPY.done('Elm Street'))).toBeVisible();
    expect(await screen.findByTestId('house-h2')).toBeVisible();
  });

  it('offers no Delete house to a support helper, who may only read it', async () => {
    jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true, permissions: ['admin:read', 'reports:write'] });
    await renderPages(ROUTES, '/admin/houses/h1');
    await untilRead(words);
    expect(await screen.findByText(HOUSES_COPY.readOnly)).toBeVisible();
    expect(screen.queryByTestId('house-delete')).toBeNull();
  });

  it('is a busy list: the database finds houses by words and filters by Pass', async () => {
    await renderPages(ROUTES, '/admin/houses');
    await untilRead(words);
    expect(housesPage).toHaveBeenLastCalledWith(null, { q: '', pass: null, active: null, after: null, before: null });
    const box = screen.getByLabelText('House, person, email or join code');
    await fireEvent(box, 'focus');
    await fireEvent.changeText(box, 'paid');
    await fireEvent.press(screen.getByTestId('houses-search-suggestion-pass-paid'));
    await waitFor(() => expect(housesPage).toHaveBeenLastCalledWith(null, expect.objectContaining({ pass: 'paid', q: '' })));
    expect(housesCount).toHaveBeenLastCalledWith(expect.objectContaining({ pass: 'paid' }));
  });

  it('keeps the old houses in view under the search line while a search reads', async () => {
    await renderPages(ROUTES, '/admin/houses');
    await untilRead(words);
    // The next read never comes back, so the list stays mid-search.
    jest.mocked(housesPage).mockReturnValue(new Promise(() => {}));
    const box = screen.getByLabelText('House, person, email or join code');
    await fireEvent(box, 'focus');
    await fireEvent.changeText(box, 'paid');
    await fireEvent.press(screen.getByTestId('houses-search-suggestion-pass-paid'));
    await waitFor(() => expect(screen.getByTestId('houses-search-line')).toBeBusy());
    expect(screen.getByTestId('house-h1')).toBeOnTheScreen();
  });

  it('shows a table on a laptop with the first house beside it', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/houses');
    await untilRead(words);
    expect(screen.getByTestId('house-h1')).toHaveTextContent(/Elm Street.*5.*Pass.*2 min ago.*74%.*12 Sep/);
    expect(screen.getByTestId('house-h2')).toHaveTextContent(/Flat 4B.*3.*None.*Never.*None due/);
    expect(await screen.findByTestId('house-panel')).toHaveTextContent(/Elm Street/);
    // Its settings, a row each.
    expect(screen.getByTestId('house-fact-zone')).toHaveTextContent(/^Time zone/);
    expect(screen.getByTestId('house-fact-code')).toHaveTextContent('Join codeK7P2QX');
    expect(screen.getByTestId('house-fact-johns')).toHaveTextContent('Johns9');
    expect(screen.getByTestId('admin-nav-houses')).toBeSelected();
    // The way back to the owner's own house, at the rail's foot.
    expect(within(screen.getByTestId('admin-rail')).getByRole('link', { name: ADMIN_COPY.backToHouse })).toBeOnTheScreen();
  });
});

describe('On a laptop, the room is used', () => {
  it('opens a house linked to directly beside the list, and the list reaches the panel', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/houses/h2');
    await untilRead(words);
    await waitFor(() => expect(ownerHouse).toHaveBeenCalledWith('h2'));
    expect(screen.getByTestId('admin-houses')).toBeVisible();
    expect(screen.queryByTestId('admin-house')).toBeNull();
    expect(screen.getByTestId('column-main')).not.toHaveStyle({ maxWidth: 1040 });
  });
});

describe('Tabs by job, on a phone', () => {
  it('has five tabs, and Records opens Deletions with a switch to the Audit log', async () => {
    await renderPages(ROUTES, '/admin/deletions');
    await untilRead(words);
    for (const key of ['overview', 'inbox', 'houses', 'send', 'records']) expect(screen.getByTestId(`admin-tab-${key}`)).toBeVisible();
    expect(screen.getByTestId('admin-tab-records')).toBeSelected();
    expect(within(screen.getByTestId('admin-switch')).getByText('Deletions')).toBeVisible();
    expect(within(screen.getByTestId('admin-switch')).getByText('Audit log')).toBeVisible();
  });

  it('shows no switch on a laptop, where the side list names every page', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/deletions');
    await untilRead(words);
    expect(screen.queryByTestId('admin-switch')).toBeNull();
    expect(screen.getByTestId('admin-nav-audit')).toBeVisible();
    expect(screen.getByText('Records')).toBeVisible();
  });
});
