import { OWNER_PERMISSION_NAMES, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { deleteByEmail, ownerStatus } from '@/api/owner';
import { forgetDetails, noteError, notePage } from '@/api/report-details';
import {
  fixReport,
  inboxCount,
  inboxRows,
  myReport,
  myReports,
  openReport,
  pickScreenshot,
  replyToReport,
  sameAsFind,
  seeReport,
  sendReport,
  setReportState,
  setSameAs,
  setSupportDraft,
  supportDraft,
  writeBack,
  type InboxRow,
  type Report,
  type SupportDraft,
} from '@/api/reports';
import ReportScreen from '@/app/(house)/you/reports/[id]';
import ReportsScreen from '@/app/(house)/you/reports/index';
import AdminLayout from '@/app/admin/_layout';
import InboxReportPage from '@/app/admin/inbox/[id]';
import InboxPage from '@/app/admin/inbox/index';
import { HelpSection } from '@/components/house-page/help-section';
import { snapshot } from '@/testing/house';
import { renderPages } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/owner', () => ({ ownerStatus: jest.fn(), liveNotices: jest.fn().mockResolvedValue([]), deleteByEmail: jest.fn() }));
jest.mock('@/api/reports', () => ({
  ...jest.requireActual<typeof import('@/api/reports')>('@/api/reports'),
  pickScreenshot: jest.fn(),
  sendReport: jest.fn(),
  myReports: jest.fn(),
  myReport: jest.fn(),
  seeReport: jest.fn(),
  writeBack: jest.fn(),
  inboxRows: jest.fn(),
  inboxCount: jest.fn(),
  openReport: jest.fn(),
  replyToReport: jest.fn(),
  setReportState: jest.fn(),
  fixReport: jest.fn(),
  setSameAs: jest.fn(),
  sameAsFind: jest.fn(),
  supportDraft: jest.fn(),
  setSupportDraft: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/api/http', () => ({ apiPost: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'ava' } }, house: { id: 'h1', name: 'The Annexe' }, refresh: jest.fn() }),
}));

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };
const MIN = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const WORDS = 'The bins John vanished from Today right after I ticked the dishes.';

const BINS: Report = {
  id: 'r1',
  kind: 'problem',
  state: 'replied',
  userId: 'ava',
  name: 'Ava Brown',
  email: 'ava@example.com',
  house: 'The Annexe',
  role: 'member',
  sentAt: ago(30 * MIN),
  words: WORDS,
  details: { pages: 'Today, then House', app: 'Jonz on the web, Safari 18, iPhone' },
  messages: [
    { from: 'them', name: 'Ava Brown', at: ago(30 * MIN), text: WORDS, shots: ['https://storage.test/shot.jpg'] },
    { from: 'jonz', name: 'Glyn', at: ago(5 * MIN), text: 'Thanks Ava, fixed in today’s update.' },
  ],
  source: 'app',
  subject: null,
  sameAs: null,
  also: [],
};

const ROW: InboxRow = {
  id: 'r1',
  userId: 'ava',
  name: 'Ava Brown',
  email: 'ava@example.com',
  house: 'The Annexe',
  kind: 'problem',
  state: 'new',
  words: WORDS,
  sentAt: ago(4 * MIN),
  source: 'app',
  subject: null,
  folded: false,
  also: 0,
  waiting: true,
};
/** Answered: Ben's, replied to yesterday. */
const ANSWERED: InboxRow = { ...ROW, id: 'r3', userId: 'ben', name: 'Ben Cole', state: 'replied', words: 'Could the week start on Monday?', kind: 'idea', waiting: false };

beforeEach(() => {
  jest.clearAllMocks();
  forgetDetails();
  (useWindowDimensions as jest.Mock).mockReturnValue(PHONE);
  jest.mocked(loadHouse).mockResolvedValue(snapshot());
  jest.mocked(catchUp).mockResolvedValue(false);
  jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true, permissions: [...OWNER_PERMISSION_NAMES] });
  jest.mocked(myReports).mockResolvedValue([
    { id: 'r1', kind: 'problem', state: 'replied', words: WORDS, sentAt: BINS.sentAt, replies: 1, unread: true },
    { id: 'r2', kind: 'idea', state: 'new', words: 'Let us pin a note to the Wall', sentAt: ago(2 * 86_400_000), replies: 0, unread: false },
  ]);
  jest.mocked(myReport).mockResolvedValue(BINS);
  jest.mocked(seeReport).mockResolvedValue(undefined);
  jest.mocked(writeBack).mockResolvedValue(undefined);
  jest.mocked(sendReport).mockResolvedValue('r9');
  jest.mocked(pickScreenshot).mockResolvedValue('file:///shot-1.jpg');
  jest.mocked(inboxRows).mockResolvedValue({ items: [ROW, { ...ROW, id: 'r2', name: 'Sam Okafor', kind: 'question', state: 'open', words: 'I think I paid twice?' }, ANSWERED], more: false, next: null });
  // Three match; two of them wait for a reply.
  jest.mocked(inboxCount).mockImplementation(async (filter) => (filter.state === 'waiting' ? 2 : 3));
  jest.mocked(openReport).mockResolvedValue({ ...BINS, state: 'open' });
  jest.mocked(replyToReport).mockResolvedValue(undefined);
  jest.mocked(setReportState).mockResolvedValue(undefined);
  jest.mocked(fixReport).mockResolvedValue({ fixed: 1, told: 1 });
  jest.mocked(setSameAs).mockResolvedValue(undefined);
  jest.mocked(sameAsFind).mockResolvedValue([{ id: 'r7', name: 'Ben Cole', words: 'The bins John is missing', state: 'open' }]);
  jest.mocked(supportDraft).mockResolvedValue(null);
  jest.mocked(setSupportDraft).mockResolvedValue(undefined);
  jest.mocked(deleteByEmail).mockResolvedValue(undefined);
});

describe('Help on House', () => {
  const ROUTES = { 'house/index': () => <HelpSection house="The Annexe" />, 'you/reports/[id]': ReportScreen };

  it('has Report a problem, Send an idea, and Your reports with the reply to read', async () => {
    await renderPages(ROUTES, '/house');
    const help = await screen.findByTestId('help-section');
    expect(within(help).getByText(words('common.report.report'))).toBeVisible();
    expect(within(help).getByText(words('common.report.idea'))).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('to-reports')).toHaveTextContent(/Your reports.*A reply to read/));
    expect(screen.getByText(words('common.report.orEmail'))).toBeVisible();
  });

  it('sends a report with a screenshot and the details it shows, then opens it under Your reports', async () => {
    notePage('/today');
    notePage('/house');
    noteError('Couldn’t read the week.');
    await renderPages(ROUTES, '/house');
    await fireEvent.press(await screen.findByTestId('to-report'));
    const form = await screen.findByTestId('report-form');
    expect(within(form).getByTestId('report-send-details')).toHaveTextContent(/Today, then House.*The Annexe.*Couldn’t read the week/);
    expect(screen.getByTestId('report-send')).toBeDisabled();

    await fireEvent.changeText(within(form).getByLabelText(words('common.report.words.problem')), WORDS);
    await fireEvent.press(screen.getByTestId('report-add-shot'));
    expect(await screen.findByTestId('report-shot-0')).toBeVisible();
    await fireEvent.press(screen.getByTestId('report-send'));

    await waitFor(() =>
      expect(sendReport).toHaveBeenCalledWith({
        kind: 'problem',
        words: WORDS,
        details: expect.objectContaining({ pages: 'Today, then House', house: 'The Annexe', error: 'Couldn’t read the week.' }),
        shots: ['file:///shot-1.jpg'],
      }),
    );
    expect(await screen.findByTestId('your-report')).toBeVisible();
  });

  it('leaves the details out when the box is unticked, and an idea is an idea', async () => {
    await renderPages(ROUTES, '/house');
    await fireEvent.press(await screen.findByTestId('to-idea'));
    const form = await screen.findByTestId('report-form');
    await fireEvent.press(within(form).getByRole('checkbox', { name: new RegExp(words('common.report.details')) }));
    await fireEvent.changeText(within(form).getByLabelText(words('common.report.words.idea')), 'Dark mode for the Wall');
    await fireEvent.press(screen.getByTestId('report-send'));
    await waitFor(() => expect(sendReport).toHaveBeenCalledWith({ kind: 'idea', words: 'Dark mode for the Wall', details: null, shots: [] }));
  });

  it('says why it could not send, and keeps what was written', async () => {
    jest.mocked(sendReport).mockRejectedValue(new Error('That’s a lot for one day. Try again tomorrow, or email support@jonz.app.'));
    await renderPages(ROUTES, '/house');
    await fireEvent.press(await screen.findByTestId('to-report'));
    await fireEvent.changeText(await screen.findByLabelText(words('common.report.words.problem')), WORDS);
    await fireEvent.press(screen.getByTestId('report-send'));
    expect(await screen.findByTestId('report-problem')).toHaveTextContent(/a lot for one day/);
    expect(screen.getByLabelText(words('common.report.words.problem'))).toHaveDisplayValue(WORDS);
  });
});

describe('Your reports', () => {
  const ROUTES = { 'you/reports/index': ReportsScreen, 'you/reports/[id]': ReportScreen };

  it('lists what you sent, newest first, with the reply to read and where each has got to', async () => {
    await renderPages(ROUTES, '/you/reports');
    const unread = await screen.findByTestId('report-r1');
    expect(unread).toHaveTextContent(/The bins John vanished.*A reply to read/);
    expect(screen.getByTestId('report-r2')).toHaveTextContent(/Let us pin a note.*Idea, sent.*Sent/);
  });

  it('opens one with the conversation, marks the reply read, and writes back', async () => {
    await renderPages(ROUTES, '/you/reports/r1');
    const thread = await screen.findByTestId('report-thread');
    expect(thread).toHaveTextContent(/You,.*The bins John vanished/);
    expect(thread).toHaveTextContent(/Glyn at Jonz,.*Thanks Ava, fixed/);
    expect(screen.getByTestId('your-report-state')).toHaveTextContent(words('common.report.state.replied'));
    await waitFor(() => expect(seeReport).toHaveBeenCalledWith('r1'));

    await fireEvent.changeText(screen.getByTestId('write-back-input'), 'Thank you!');
    await fireEvent.press(screen.getByTestId('write-back-send'));
    await waitFor(() => expect(writeBack).toHaveBeenCalledWith('r1', 'Thank you!'));
    await waitFor(() => expect(screen.getByTestId('write-back-input')).toHaveDisplayValue(''));
  });

  it('says so when a report is not yours or not there', async () => {
    jest.mocked(myReport).mockResolvedValue(null);
    await renderPages(ROUTES, '/you/reports/r404');
    expect(await screen.findByText(words('common.report.missing'))).toBeVisible();
    expect(seeReport).not.toHaveBeenCalled();
  });
});

describe('the owner’s Inbox', () => {
  const ROUTES = { 'admin/_layout': AdminLayout, 'admin/inbox/index': InboxPage, 'admin/inbox/[id]': InboxReportPage };

  it('is a busy list that opens on every report, a page of its own per report on a phone', async () => {
    await renderPages(ROUTES, '/admin/inbox');
    const row = await screen.findByTestId('inbox-r1');
    expect(row).toHaveTextContent(/Ava Brown.*The bins John vanished.*Problem, The Annexe, 4 min/);
    expect(inboxRows).toHaveBeenLastCalledWith(null, { q: '', state: null, source: null, kind: null, after: null, before: null });
    await fireEvent.press(row);
    expect(await screen.findByTestId('admin-inbox-report')).toBeVisible();
    await waitFor(() => expect(openReport).toHaveBeenCalledWith('r1'));
  });

  it('replies to the sender, and marks it fixed, from the report', async () => {
    await renderPages(ROUTES, '/admin/inbox/r1');
    const panel = await screen.findByTestId('report-panel');
    expect(panel).toHaveTextContent(/Ava Brown.*The Annexe, housemate, ava@example.com/);
    expect(panel).toHaveTextContent(/Pages.*Today, then House/);
    await fireEvent.changeText(screen.getByTestId('report-reply-input'), 'Fixed now, thank you.');
    await fireEvent.press(screen.getByTestId('report-reply-send'));
    await waitFor(() => expect(replyToReport).toHaveBeenCalledWith('r1', 'Fixed now, thank you.'));
    await fireEvent.press(screen.getByTestId('report-fixed'));
    const fix = await screen.findByTestId('report-fix-form');
    await fireEvent.changeText(within(fix).getByTestId('report-fix-note'), 'Fixed in today’s update.');
    await fireEvent.press(within(fix).getByTestId('report-fix-send'));
    await waitFor(() => expect(fixReport).toHaveBeenCalledWith('r1', 'Fixed in today’s update.', true));
    expect(await screen.findByTestId('report-fixed-done')).toHaveTextContent(words('common.report.fixedTold', { told: 1 }));
  });

  it('marks fixed without telling anyone when the box is unticked, and says how many it tells', async () => {
    jest.mocked(openReport).mockResolvedValue({
      ...BINS,
      state: 'open',
      also: [
        { id: 'r7', name: 'Ben Cole', words: 'Bins gone', state: 'open' },
        { id: 'r8', name: 'Sam', words: 'Same here', state: 'new' },
      ],
    });
    jest.mocked(fixReport).mockResolvedValue({ fixed: 3, told: 0 });
    await renderPages(ROUTES, '/admin/inbox/r1');
    expect(await screen.findByTestId('report-also')).toHaveTextContent(/2 more people reported this.*Ben Cole.*Sam/);
    await fireEvent.press(screen.getByTestId('report-fixed'));
    const fix = await screen.findByTestId('report-fix-form');
    const tell = within(fix).getByRole('checkbox', { name: new RegExp(words('common.report.fixTell', { count: 3 })) });
    await fireEvent.press(tell);
    await fireEvent.press(within(fix).getByTestId('report-fix-send'));
    await waitFor(() => expect(fixReport).toHaveBeenCalledWith('r1', '', false));
  });

  it('folds a report into the one it is the same as, and takes it out again', async () => {
    await renderPages(ROUTES, '/admin/inbox/r1');
    await fireEvent.press(await screen.findByTestId('report-same'));
    const same = await screen.findByTestId('report-same-form');
    await fireEvent.changeText(within(same).getByTestId('report-same-search'), 'bins');
    await waitFor(() => expect(sameAsFind).toHaveBeenCalledWith('r1', 'bins'));
    await fireEvent.press(await within(same).findByTestId('report-same-r7'));
    await waitFor(() => expect(setSameAs).toHaveBeenCalledWith('r1', 'r7'));

    jest.mocked(openReport).mockResolvedValue({ ...BINS, state: 'open', sameAs: { id: 'r7', name: 'Ben Cole', words: 'The bins John is missing', state: 'open' } });
    await renderPages(ROUTES, '/admin/inbox/r2');
    expect(await screen.findByTestId('report-same-as')).toHaveTextContent(/Same as Ben’s report.*The bins John is missing/);
    expect(screen.queryByTestId('report-same')).toBeNull();
    await fireEvent.press(screen.getByTestId('report-not-same'));
    await waitFor(() => expect(setSameAs).toHaveBeenCalledWith('r1', null));
  });

  it('shows an emailed report with its address and subject, and replies by email', async () => {
    jest.mocked(openReport).mockResolvedValue({
      ...BINS,
      kind: 'question',
      state: 'open',
      userId: null,
      name: 'Sam Lee',
      email: 'sam@example.com',
      house: null,
      role: null,
      details: null,
      source: 'email',
      subject: 'Paying the Stake',
    });
    await renderPages(ROUTES, '/admin/inbox/r1');
    const panel = await screen.findByTestId('report-panel');
    expect(panel).toHaveTextContent(/Sam Lee.*sam@example.com, by email.*Subject: Paying the Stake/);
    expect(screen.getByLabelText(words('common.report.replyByEmail', { name: 'Sam' }))).toBeVisible();
  });

  it('says which reports came by email in the list', async () => {
    jest.mocked(inboxRows).mockResolvedValue({
      items: [{ ...ROW, name: 'Sam Lee', userId: null, house: null, kind: 'question', source: 'email', subject: 'Paying the Stake', also: 2 }],
      more: false,
      next: null,
    });
    await renderPages(ROUTES, '/admin/inbox');
    expect(await screen.findByTestId('inbox-r1')).toHaveTextContent(/Sam Lee.*Paying the Stake: The bins John.*\+2.*Question, by email, 4 min/);
  });

  it('has no reply box once its sender has deleted their account, and opens a fixed one again', async () => {
    jest.mocked(openReport).mockResolvedValue({ ...BINS, state: 'fixed', userId: null, name: 'Someone who left', email: null });
    await renderPages(ROUTES, '/admin/inbox/r1');
    await screen.findByTestId('report-panel');
    expect(screen.queryByTestId('report-reply-box')).toBeNull();
    await fireEvent.press(screen.getByTestId('report-reopen'));
    await waitFor(() => expect(setReportState).toHaveBeenCalledWith('r1', 'open'));
  });

  it('puts what needs a reply first, then everything else, each group with its count', async () => {
    await renderPages(ROUTES, '/admin/inbox');
    const waiting = await screen.findByTestId('inbox-group-waiting');
    expect(await within(waiting).findByText(`${words('admin.inbox.waiting')}, 2`)).toBeVisible();
    expect(within(waiting).getByTestId('inbox-r1')).toBeVisible();
    expect(within(waiting).getByTestId('inbox-r2')).toBeVisible();
    expect(within(waiting).queryByTestId('inbox-r3')).toBeNull();
    const rest = screen.getByTestId('inbox-group-rest');
    expect(within(rest).getByText(`${words('admin.inbox.rest')}, 1`)).toBeVisible();
    expect(within(rest).getByTestId('inbox-r3')).toBeVisible();
    expect(inboxCount).toHaveBeenCalledWith(expect.objectContaining({ state: 'waiting' }));
  });

  it('searches both groups at once, and leaves out a group with nothing in it', async () => {
    jest.mocked(inboxRows).mockResolvedValue({ items: [ANSWERED], more: false, next: null });
    jest.mocked(inboxCount).mockImplementation(async (filter) => (filter.state === 'waiting' ? 0 : 1));
    await renderPages(ROUTES, '/admin/inbox?q=monday');
    expect(await screen.findByTestId('inbox-r3')).toBeVisible();
    expect(inboxRows).toHaveBeenLastCalledWith(null, expect.objectContaining({ q: 'monday', state: null }));
    expect(inboxCount).toHaveBeenCalledWith(expect.objectContaining({ q: 'monday', state: 'waiting' }));
    expect(screen.queryByTestId('inbox-group-waiting')).toBeNull();
    expect(await screen.findByText(`${words('admin.inbox.rest')}, 1`)).toBeVisible();
  });

  it('is one plain list when a state is picked', async () => {
    jest.mocked(inboxRows).mockResolvedValue({ items: [ANSWERED], more: false, next: null });
    await renderPages(ROUTES, '/admin/inbox?state=replied');
    expect(await screen.findByTestId('inbox-r3')).toBeVisible();
    expect(inboxRows).toHaveBeenLastCalledWith(null, expect.objectContaining({ state: 'replied' }));
    expect(screen.queryByTestId('inbox-group-waiting')).toBeNull();
    expect(screen.queryByTestId('inbox-group-rest')).toBeNull();
  });

  it('is a table on a laptop, with the chosen report beside it', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/inbox');
    await screen.findByTestId('inbox-r1');
    await waitFor(() => expect(openReport).toHaveBeenCalledWith('r1'));
    await fireEvent.press(screen.getByTestId('inbox-r2'));
    await waitFor(() => expect(openReport).toHaveBeenCalledWith('r2'));
    // The two groups are a table each, the column names over the first.
    expect(within(screen.getByTestId('inbox-group-waiting')).getByTestId('inbox-r1')).toBeVisible();
    expect(within(screen.getByTestId('inbox-group-rest')).getByTestId('inbox-r3')).toBeVisible();
  });
});

describe('the support agent', () => {
  const ROUTES = { 'admin/_layout': AdminLayout, 'admin/inbox/index': InboxPage, 'admin/inbox/[id]': InboxReportPage };
  const DRAFT: SupportDraft = {
    id: 'd1',
    state: 'ready',
    reply: 'Thanks Ava, I can see it. I’m looking at it now.',
    action: 'same_as',
    sameAs: { id: 'r7', name: 'Ben Cole', words: 'The bins John is missing', state: 'open' },
    why: 'Ben reported the same thing yesterday.',
  };
  // Waiting: Ava's words, and nothing from Jonz yet.
  beforeEach(() => jest.mocked(openReport).mockResolvedValue({ ...BINS, state: 'open', messages: [BINS.messages[0]] }));

  it('suggests a reply and a step, and does both only when the owner taps', async () => {
    jest.mocked(supportDraft).mockResolvedValue(DRAFT);
    await renderPages(ROUTES, '/admin/inbox/r1');
    const card = await screen.findByTestId('support-draft');
    expect(card).toHaveTextContent(/Jonz suggests.*Ben reported the same thing yesterday.*Thanks Ava, I can see it.*Same as Ben’s report/);
    expect(replyToReport).not.toHaveBeenCalled();
    expect(setSameAs).not.toHaveBeenCalled();
    await fireEvent.press(within(card).getByTestId('support-draft-send'));
    await waitFor(() => expect(setSupportDraft).toHaveBeenCalledWith('d1', 'used'));
    expect(replyToReport).toHaveBeenCalledWith('r1', DRAFT.reply);
    expect(setSameAs).toHaveBeenCalledWith('r1', 'r7');
  });

  it('puts the words in the reply box to change first, and sets one aside', async () => {
    jest.mocked(supportDraft).mockResolvedValue({ ...DRAFT, action: 'none', sameAs: null });
    await renderPages(ROUTES, '/admin/inbox/r1');
    await fireEvent.press(await screen.findByTestId('support-draft-edit'));
    expect(screen.getByTestId('report-reply-input')).toHaveDisplayValue(DRAFT.reply);
    await fireEvent.changeText(screen.getByTestId('report-reply-input'), 'Thanks Ava, on it.');
    await fireEvent.press(screen.getByTestId('report-reply-send'));
    await waitFor(() => expect(replyToReport).toHaveBeenCalledWith('r1', 'Thanks Ava, on it.'));
    await waitFor(() => expect(setSupportDraft).toHaveBeenCalledWith('d1', 'used'));
    expect(setSameAs).not.toHaveBeenCalled();
  });

  it('sets a suggestion aside with Not this', async () => {
    jest.mocked(supportDraft).mockResolvedValue({ ...DRAFT, action: 'none', sameAs: null });
    await renderPages(ROUTES, '/admin/inbox/r1');
    await fireEvent.press(await screen.findByTestId('support-draft-dismiss'));
    await waitFor(() => expect(setSupportDraft).toHaveBeenCalledWith('d1', 'dismissed'));
    await waitFor(() => expect(screen.queryByTestId('support-draft')).toBeNull());
    expect(replyToReport).not.toHaveBeenCalled();
  });

  it('asks again before it starts the 30 days', async () => {
    jest.mocked(supportDraft).mockResolvedValue({ ...DRAFT, action: 'delete', sameAs: null });
    await renderPages(ROUTES, '/admin/inbox/r1');
    const card = await screen.findByTestId('support-draft');
    expect(card).toHaveTextContent(new RegExp(words('admin.support.deleteStep')));
    await fireEvent.press(within(card).getByTestId('support-draft-send'));
    expect(deleteByEmail).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByTestId('support-draft-delete-yes'));
    await waitFor(() => expect(deleteByEmail).toHaveBeenCalledWith('ava@example.com', words('admin.support.deleteReason')));
    expect(replyToReport).toHaveBeenCalledWith('r1', DRAFT.reply);
  });

  it('suggests nothing on a report that is already answered', async () => {
    jest.mocked(openReport).mockResolvedValue({ ...BINS, state: 'replied' });
    jest.mocked(supportDraft).mockResolvedValue(DRAFT);
    await renderPages(ROUTES, '/admin/inbox/r1');
    await screen.findByTestId('report-panel');
    expect(screen.queryByTestId('support-draft')).toBeNull();
    expect(supportDraft).not.toHaveBeenCalled();
  });
});
