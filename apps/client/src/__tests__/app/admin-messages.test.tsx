import { MESSAGE_LIMITS, OWNER_PERMISSION_NAMES, wordsFor } from '@app/core';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { useWindowDimensions } from 'react-native';

import { findHouses, findPeople, messageReach, sendMessage, sentCount, sentPage, type SentRow } from '@/api/messages';
import { ownerStatus } from '@/api/owner';
import AdminLayout from '@/app/admin/_layout';
import MessagesPage from '@/app/admin/messages/index';
import NewMessagePage from '@/app/admin/messages/new';
import SentPage from '@/app/admin/messages/sent';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/owner', () => ({ ownerStatus: jest.fn() }));
jest.mock('@/api/messages', () => ({
  ...jest.requireActual<typeof import('@/api/messages')>('@/api/messages'),
  messageReach: jest.fn(),
  findPeople: jest.fn(),
  findHouses: jest.fn(),
  sendMessage: jest.fn(),
  sentPage: jest.fn(),
  sentCount: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'owner' } }, house: null, refresh: jest.fn() }),
}));

const PHONE = { width: 390, height: 844, scale: 3, fontScale: 1 };
const LAPTOP = { width: 1440, height: 900, scale: 1, fontScale: 1 };

const ROUTES = {
  'admin/_layout': AdminLayout,
  'admin/messages/index': MessagesPage,
  'admin/messages/new': NewMessagePage,
  'admin/messages/sent': SentPage,
};

const WELCOME: SentRow = {
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

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue(PHONE);
  jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true, permissions: [...OWNER_PERMISSION_NAMES] });
  jest.mocked(messageReach).mockResolvedValue({ people: 5, push: 4, email: 5, houses: 1 });
  jest.mocked(findHouses).mockResolvedValue([{ id: 'h1', name: 'Elm Street', people: 5 }]);
  jest.mocked(findPeople).mockResolvedValue([{ id: 'u1', name: 'Ava', email: 'ava@example.com', houseName: 'Elm Street' }]);
  jest.mocked(sendMessage).mockResolvedValue({ ok: true, id: 'm9', people: 5, walls: 1, sent: 5 });
  jest.mocked(sentPage).mockResolvedValue({ items: [WELCOME], more: false, next: null });
  jest.mocked(sentCount).mockResolvedValue(1);
});

async function write(subject: string, body: string) {
  await fireEvent.changeText(screen.getByTestId('message-subject'), subject);
  await fireEvent.changeText(screen.getByTestId('message-body'), body);
}

describe('A new message', () => {
  it('sends you a test before anyone else gets it: a push, never on a Wall', async () => {
    await renderPages(ROUTES, '/admin/messages/new');
    await untilRead(words);
    await write('Testing pushes', 'Does this reach my iPhone?');
    await fireEvent.press(screen.getByTestId('message-test'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(jest.mocked(sendMessage).mock.calls[0][0]).toMatchObject({
      audience: 'test',
      subject: 'Testing pushes',
      ways: { push: true, wall: false, email: false },
    });
    expect(await screen.findByText(words('admin.messages.testToast'))).toBeVisible();
  });

  it('finds a house, says how many it reaches, and sends to them', async () => {
    await renderPages(ROUTES, '/admin/messages/new');
    await untilRead(words);
    await fireEvent.changeText(screen.getByTestId('message-find'), 'elm');
    await fireEvent.press(await screen.findByTestId('message-found-h1'));
    expect(await screen.findByText('Send to 5 people')).toBeVisible();
    expect(screen.getByText('4 of 5 people have them on, silent in quiet hours')).toBeVisible();
    await write('About last week’s reset', 'We’ve put the points back.');
    await fireEvent.press(screen.getByTestId('message-send'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(jest.mocked(sendMessage).mock.calls[0][0]).toMatchObject({ audience: 'house', houseId: 'h1', ways: { push: true, wall: true, email: false } });
    expect(await screen.findByText(words('admin.messages.sentToast', { n: 5 }))).toBeVisible();
  });

  it('says what is missing rather than sending', async () => {
    await renderPages(ROUTES, '/admin/messages/new');
    await untilRead(words);
    await fireEvent.press(screen.getByTestId('message-send'));
    expect(await screen.findByText(words('admin.messages.pickHouse'))).toBeVisible();
    expect(screen.getByText(words('admin.messages.subjectProblem', { max: MESSAGE_LIMITS.subject }))).toBeVisible();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a message to one person off the Wall', async () => {
    await renderPages(ROUTES, '/admin/messages/new');
    await untilRead(words);
    await fireEvent.press(screen.getByText(words('admin.messages.audience.person')));
    const wall = screen.getByTestId('message-way-wall');
    expect(wall).not.toBeChecked();
    expect(wall).toBeDisabled();
    expect(within(wall).getByText(words('admin.messages.wallNotPerson'))).toBeVisible();
  });

  it('asks again, naming the number, before sending to everyone', async () => {
    await renderPages(ROUTES, '/admin/messages/new');
    await untilRead(words);
    await fireEvent.press(screen.getByText(words('admin.messages.audience.everyone')));
    await write('Welcome to the beta', 'Thanks for trying Jonz.');
    await fireEvent.press(await screen.findByText('Send to 5 people'));
    expect(sendMessage).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByText(words('admin.messages.confirmSend', { n: 5 })));
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(jest.mocked(sendMessage).mock.calls[0][0]).toMatchObject({ audience: 'everyone' });
  });
});

describe('Messages', () => {
  it('lists every message sent first, and on a phone opens one in full as a sheet', async () => {
    await renderPages(ROUTES, '/admin/messages');
    await untilRead(words);
    expect(screen.queryByTestId('message-form')).toBeNull();
    await fireEvent.press(await screen.findByTestId('sent-m1'));
    const sheet = await screen.findByTestId('sent-sheet');
    expect(within(sheet).getByText('Thanks for trying Jonz.')).toBeVisible();
    await act(async () => {});
  });

  it('pushes New message as a page of its own on a phone', async () => {
    await renderPages(ROUTES, '/admin/messages');
    await untilRead(words);
    await fireEvent.press(screen.getByTestId('message-new'));
    expect(await screen.findByTestId('admin-message-new')).toBeVisible();
    expect(screen.getByTestId('message-form')).toBeVisible();
  });

  it('on a laptop writes the new message in the side panel, how it looks under it', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/messages');
    await untilRead(words);
    expect(await screen.findByText('Welcome to the beta')).toBeVisible();
    const side = screen.getByTestId('message-side');
    expect(within(side).getByTestId('message-form')).toBeVisible();
    expect(within(side).getByTestId('message-preview')).toBeVisible();
    expect(screen.getByTestId('admin-nav-messages')).toBeSelected();
  });

  it('on a laptop opens a sent one in the panel, and New message brings the form back with its words', async () => {
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/messages');
    await untilRead(words);
    await write('Half written', 'Not sent yet.');
    await fireEvent.press(await screen.findByTestId('sent-m1'));
    const side = screen.getByTestId('message-side');
    // Its words, and how they looked.
    expect(within(side).getAllByText('Thanks for trying Jonz.')[0]).toBeVisible();
    expect(screen.queryByTestId('sent-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('message-new'));
    expect(within(side).queryByText('Thanks for trying Jonz.')).toBeNull();
    expect(screen.getByTestId('message-subject')).toHaveProp('value', 'Half written');
  });

  it('gives someone who can\u2019t send the list alone', async () => {
    jest.mocked(ownerStatus).mockResolvedValue({ owner: true, mfa: true, permissions: OWNER_PERMISSION_NAMES.filter((p) => p !== 'messages:write') });
    (useWindowDimensions as jest.Mock).mockReturnValue(LAPTOP);
    await renderPages(ROUTES, '/admin/messages');
    await untilRead(words);
    expect(await screen.findByText('Welcome to the beta')).toBeVisible();
    expect(screen.queryByTestId('message-new')).toBeNull();
    expect(screen.queryByTestId('message-form')).toBeNull();
  });

  it('lands an old All sent link on the list', async () => {
    await renderPages(ROUTES, '/admin/messages/sent');
    await untilRead(words);
    expect(await screen.findByTestId('admin-messages')).toBeVisible();
    expect(await screen.findByTestId('sent-m1')).toBeVisible();
    await act(async () => {});
  });
});
