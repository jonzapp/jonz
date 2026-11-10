import {
  AUDIT_LIST_COPY,
  DELETION_LIST_COPY,
  HOUSES_COPY,
  LIST_COPY,
  MESSAGE_COPY,
  NOTICE_LIST_COPY,
  OWNER_PERMISSION_NAMES,
  PROMOTIONS_COPY,
  REPORT_COPY,
  type AuditEntry,
  type HouseRow,
  type Notice,
  type PromotionRow,
} from '@app/core';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { useWindowDimensions } from 'react-native';

import { housesCount, housesPage } from '@/api/houses';
import { sentCount, sentPage, type SentRow } from '@/api/messages';
import { auditCount, auditPage, deletionsCount, deletionsPage, liveNotices, noticesCount, noticesPage, ownerStatus } from '@/api/owner';
import { promotionsCount, promotionsPage } from '@/api/promotions';
import { inboxCount, inboxPage, type InboxRow } from '@/api/reports';
import AdminLayout from '@/app/admin/_layout';
import AuditPage from '@/app/admin/audit/index';
import DeletionsPage from '@/app/admin/deletions';
import HousesPage from '@/app/admin/houses/index';
import InboxPage from '@/app/admin/inbox/index';
import MessagesPage from '@/app/admin/messages/index';
import NoticesPage from '@/app/admin/notices';
import PromotionsPage from '@/app/admin/promotions/index';
import { authStorage } from '@/api/storage';
import { renderPages } from '@/testing/pages';

// Every admin list shares one search box. From the first key the box spins
// and the count says Searching… until the answer is in (search loading A,
// picked 10 Nov). Typing in it must never take the
// cursor out of it: not while the list reads, not when nothing matches, not
// when rows come back. A box that is drawn again from scratch (a new one in
// its place) loses the cursor, so each page is typed into on a phone and on
// a laptop, through every turn the list can take, and the box must be the
// very same one throughout. The search reads are held until the test lets
// them go, so "while it reads" is a real moment, not a race.

jest.mock('@/api/owner', () => ({
  ...jest.requireActual<typeof import('@/api/owner')>('@/api/owner'),
  ownerStatus: jest.fn(),
  liveNotices: jest.fn(),
  noticesPage: jest.fn(),
  noticesCount: jest.fn(),
  auditPage: jest.fn(),
  auditCount: jest.fn(),
  auditEntry: jest.fn(() => new Promise(() => undefined)),
  deletionsPage: jest.fn(),
  deletionsCount: jest.fn(),
}));
jest.mock('@/api/houses', () => ({
  ...jest.requireActual<typeof import('@/api/houses')>('@/api/houses'),
  housesPage: jest.fn(),
  housesCount: jest.fn(),
  // The house beside the list on a laptop: still reading, which is all this test needs of it.
  ownerHouse: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('@/api/reports', () => ({
  ...jest.requireActual<typeof import('@/api/reports')>('@/api/reports'),
  inboxPage: jest.fn(),
  inboxCount: jest.fn(),
  openReport: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('@/api/messages', () => ({
  ...jest.requireActual<typeof import('@/api/messages')>('@/api/messages'),
  sentPage: jest.fn(),
  sentCount: jest.fn(),
}));
jest.mock('@/api/promotions', () => ({
  ...jest.requireActual<typeof import('@/api/promotions')>('@/api/promotions'),
  promotionsPage: jest.fn(),
  promotionsCount: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/http', () => ({ apiPost: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'owner' } }, house: null, refresh: jest.fn() }),
}));

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

// Fixed moments, never the real clock's.
const AT = '2026-10-30T16:41:07Z';

const ENTRY: AuditEntry = {
  id: 1,
  at: AT,
  actor: 'owner',
  action: 'notice.save',
  targetKind: 'notice',
  targetId: 'n1',
  reason: null,
  before: null,
  after: { kind: 'status', title: 'Jonz is slow right now' },
};
const NOTICE: Notice = {
  id: 'n1',
  kind: 'news',
  title: 'Jonz is on iPhone',
  body: 'Find it in the App Store.',
  linkLabel: null,
  linkUrl: null,
  startsAt: '2026-10-01T09:00:00Z',
  endsAt: '2026-10-08T09:00:00Z',
};
const PERSON = {
  userId: 'sam',
  name: 'Sam',
  email: 'sam@example.com',
  house: 'The Annexe',
  requestedAt: '2026-10-28T10:00:00Z',
  deleteAfter: '2026-11-27T10:00:00Z',
  requestedBy: 'self' as const,
};
const HOUSE: HouseRow = {
  id: 'h1',
  name: 'Elm Street',
  joinCode: 'K7P2QX',
  people: 5,
  passPlan: 'yearly',
  passUntil: '2027-09-03T00:00:00Z',
  lastActive: AT,
  onTime: 37,
  settled: 50,
  createdAt: '2026-09-12T10:00:00Z',
  sortAt: AT,
};
const REPORT: InboxRow = {
  id: 'r1',
  userId: 'ava',
  name: 'Ava Brown',
  email: 'ava@example.com',
  house: 'The Annexe',
  kind: 'problem',
  state: 'new',
  words: 'The bins John is missing',
  sentAt: AT,
  source: 'app',
  subject: null,
  folded: false,
  also: 0,
};
const SENT: SentRow = {
  id: 'm1',
  sentAt: '2026-11-02T09:00:00Z',
  audience: 'everyone',
  toName: null,
  subject: 'Welcome to the beta',
  body: 'Thanks for trying Jonz.',
  push: true,
  wall: true,
  email: false,
  people: 412,
  walls: 120,
  waiting: 0,
};
const PROMOTION: PromotionRow = {
  id: 'p1',
  madeAt: AT,
  code: 'BETA',
  name: 'Beta testers',
  terms: { kind: 'percent', percentOff: 50, amountOff: null, duration: 'once', months: null, plans: ['yearly'], endsAt: null },
  audience: 'anyone',
  people: 0,
  uses: 3,
  maxUses: null,
  state: 'live',
};

/**
 * What a page's reads answer: everything with no words, nothing for "zz",
 * and while `held` is set, nothing at all until it's let go.
 */
let held: Promise<void> | null = null;
async function answer<T>(q: string | undefined, rows: T[]): Promise<T[]> {
  if (held) await held;
  return q === 'zz' ? [] : rows;
}

interface Page {
  name: string;
  url: string;
  route: string;
  component: ComponentType;
  placeholder: string;
  /** A row's test id, drawn once the rows are in. */
  row: string;
  /** Sets the page's reads to answer as `answer` does. */
  reads: () => void;
}

const PAGES: Page[] = [
  {
    name: 'audit',
    url: '/admin/audit',
    route: 'admin/audit/index',
    component: AuditPage,
    placeholder: AUDIT_LIST_COPY.searchPlaceholder,
    row: 'audit-row-1',
    reads: () => {
      jest.mocked(auditPage).mockImplementation(async (_c, f) => ({ entries: await answer(f?.q, [ENTRY]), more: false, next: null }));
      jest.mocked(auditCount).mockImplementation(async (f) => (await answer(f?.q, [ENTRY])).length);
    },
  },
  {
    name: 'deletions',
    url: '/admin/deletions',
    route: 'admin/deletions',
    component: DeletionsPage,
    placeholder: DELETION_LIST_COPY.searchPlaceholder,
    row: 'deletion-sam',
    reads: () => {
      jest.mocked(deletionsPage).mockImplementation(async (_c, f) => ({ people: await answer(f.q, [PERSON]), more: false, next: null }));
      jest.mocked(deletionsCount).mockImplementation(async (f) => (await answer(f.q, [PERSON])).length);
    },
  },
  {
    name: 'notices',
    url: '/admin/notices',
    route: 'admin/notices',
    component: NoticesPage,
    placeholder: NOTICE_LIST_COPY.searchPlaceholder,
    row: 'notice-row-n1',
    reads: () => {
      jest.mocked(noticesPage).mockImplementation(async (_c, f) => ({ notices: await answer(f.q, [NOTICE]), more: false, next: null }));
      jest.mocked(noticesCount).mockImplementation(async (f) => (await answer(f.q, [NOTICE])).length);
    },
  },
  {
    name: 'houses',
    url: '/admin/houses',
    route: 'admin/houses/index',
    component: HousesPage,
    placeholder: HOUSES_COPY.searchPlaceholder,
    row: 'house-h1',
    reads: () => {
      jest.mocked(housesPage).mockImplementation(async (_c, f) => ({ items: await answer(f.q, [HOUSE]), more: false, next: null }));
      jest.mocked(housesCount).mockImplementation(async (f) => (await answer(f.q, [HOUSE])).length);
    },
  },
  {
    name: 'inbox',
    url: '/admin/inbox',
    route: 'admin/inbox/index',
    component: InboxPage,
    placeholder: REPORT_COPY.searchPlaceholder,
    row: 'inbox-r1',
    reads: () => {
      jest.mocked(inboxPage).mockImplementation(async (_c, f) => ({ items: await answer(f.q, [REPORT]), more: false, next: null }));
      jest.mocked(inboxCount).mockImplementation(async (f) => (await answer(f.q, [REPORT])).length);
    },
  },
  {
    name: 'sent',
    url: '/admin/messages',
    route: 'admin/messages/index',
    component: MessagesPage,
    placeholder: MESSAGE_COPY.searchPlaceholder,
    row: 'sent-m1',
    reads: () => {
      jest.mocked(sentPage).mockImplementation(async (_c, f) => ({ items: await answer(f.q, [SENT]), more: false, next: null }));
      jest.mocked(sentCount).mockImplementation(async (f) => (await answer(f.q, [SENT])).length);
    },
  },
  {
    name: 'promotions',
    url: '/admin/promotions',
    route: 'admin/promotions/index',
    component: PromotionsPage,
    placeholder: PROMOTIONS_COPY.searchPlaceholder,
    row: 'promotion-BETA',
    reads: () => {
      jest.mocked(promotionsPage).mockImplementation(async (_c, f) => ({ items: await answer(f.q, [PROMOTION]), more: false, next: null }));
      jest.mocked(promotionsCount).mockImplementation(async (f) => (await answer(f.q, [PROMOTION])).length);
    },
  },
];

beforeEach(() => {
  authStorage.clear();
  held = null;
  jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true, permissions: [...OWNER_PERMISSION_NAMES] });
  jest.mocked(liveNotices).mockResolvedValue([]);
  for (const page of PAGES) page.reads();
});

const SCREENS = [
  ['a phone', PHONE],
  ['a laptop', LAPTOP],
] as const;

describe.each(SCREENS)('the search box keeps the cursor as you type, on %s', (_name, size) => {
  it.each(PAGES.map((page) => [page.name, page] as const))('%s', async (_n, page) => {
    (useWindowDimensions as jest.Mock).mockReturnValue(size);
    await renderPages({ 'admin/_layout': AdminLayout, [page.route]: page.component }, page.url);
    expect(await screen.findByTestId(page.row)).toBeOnTheScreen();

    const box = screen.getByLabelText(page.placeholder);
    /** The box is the one typed into: never taken away and drawn again, which would drop the cursor. */
    const stillTheBox = (value: string) => {
      const now = screen.getByLabelText(page.placeholder);
      expect(now).toBe(box);
      expect(now).toHaveDisplayValue(value);
    };
    await fireEvent(box, 'focus');

    // A search that finds nothing, read slowly: the rows stay (dimmed) while it reads, then Nothing matches.
    let letGo = () => undefined as void;
    held = new Promise<void>((done) => (letGo = done));
    await fireEvent.changeText(box, 'zz');
    // It heard you at once: the box spins and the count stops claiming the last search's number.
    expect(screen.getByTestId(`${page.name}-search-spinner`, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId(`${page.name}-count-searching`)).toHaveTextContent(`${LIST_COPY.searching}…`);
    // Words alone offer nothing to pick, so nothing opens over the list.
    expect(screen.queryByTestId(`${page.name}-search-panel`)).toBeNull();
    await waitFor(() => expect(screen.getByTestId(`${page.name}-search-line`)).toHaveProp('accessibilityLabel', expect.any(String)), { timeout: 3000 });
    stillTheBox('zz');
    letGo();
    held = null;
    expect(await screen.findByTestId(`${page.name}-no-match`)).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId(`${page.name}-search-spinner`, { includeHiddenElements: true })).toBeNull());
    expect(screen.getByTestId(`${page.name}-count`)).toHaveTextContent(/^0 /);
    stillTheBox('zz');

    // Back to words that find it: the rows come back, and the box is still the one being typed in.
    await fireEvent.changeText(box, 'z');
    expect(await screen.findByTestId(page.row)).toBeOnTheScreen();
    stillTheBox('z');

    // And empty again, everything.
    await fireEvent.changeText(box, '');
    await waitFor(() => expect(screen.queryByTestId(`${page.name}-clear`)).toBeNull());
    stillTheBox('');
  });
});
