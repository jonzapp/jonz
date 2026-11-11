import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { deletionStatus } from '@/api/account';
import { getMyHouse } from '@/api/house';
import { myLanguage, setMyLanguage } from '@/api/language';
import { MembershipProvider, useMembership } from '@/hooks/use-membership';
import { useSession } from '@/hooks/use-session';
import { useLanguage, useWords } from '@/hooks/use-words';
import { deviceLanguage } from '@/locale';

jest.mock('@/api/house', () => ({ getMyHouse: jest.fn() }));
jest.mock('@/api/account', () => ({ deletionStatus: jest.fn().mockResolvedValue(null) }));
jest.mock('@/api/language', () => ({ myLanguage: jest.fn().mockResolvedValue('en'), setMyLanguage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/locale', () => ({ deviceLanguage: jest.fn(() => 'en') }));
jest.mock('@/hooks/use-session', () => ({ useSession: jest.fn() }));
jest.mock('@/api/microsoft-photo', () => ({ followMicrosoftSignIns: () => () => undefined }));

const myHouse = getMyHouse as jest.Mock;
const session = useSession as jest.Mock;
const FLAT = { id: 'h1', name: 'Flat 3' };

function Probe() {
  const { loading, failed, house, refresh } = useMembership();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="refresh" onPress={() => void refresh()}>
      <Text>{loading ? 'loading' : failed ? 'failed' : (house?.name ?? 'no house')}</Text>
    </Pressable>
  );
}

async function mount() {
  await render(
    <MembershipProvider>
      <Probe />
    </MembershipProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it('knows nothing until the saved session has been read', async () => {
  session.mockReturnValue({ session: null, loading: true });
  await mount();
  expect(screen.getByText('loading')).toBeOnTheScreen();
});

it('is in no house, and reads none, when signed out', async () => {
  session.mockReturnValue({ session: null, loading: false });
  await mount();
  expect(screen.getByText('no house')).toBeOnTheScreen();
  expect(myHouse).not.toHaveBeenCalled();
});

it("stays loading until the signed-in person's house has been read", async () => {
  let answer!: (house: typeof FLAT) => void;
  myHouse.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  session.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
  await mount();
  expect(screen.getByText('loading')).toBeOnTheScreen();
  await act(async () => answer(FLAT));
  expect(screen.getByText('Flat 3')).toBeOnTheScreen();
  expect(myHouse).toHaveBeenCalledWith('u1');
});

it('reads the house again on refresh, after creating or joining one', async () => {
  myHouse.mockResolvedValueOnce(null).mockResolvedValueOnce(FLAT);
  session.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
  await mount();
  expect(await screen.findByText('no house')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'refresh' }));
  expect(await screen.findByText('Flat 3')).toBeOnTheScreen();
});

it("says so when the house can't be read, rather than claiming there's none", async () => {
  myHouse.mockRejectedValue(new Error('offline'));
  session.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
  await mount();
  expect(await screen.findByText('failed')).toBeOnTheScreen();
});

it('needs a provider', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(render(<Probe />)).rejects.toThrow('MembershipProvider');
});

it('knows when the account is waiting to be deleted, and lets the house decide if it can’t tell', async () => {
  function Deleting() {
    const { loading, deletion } = useMembership();
    return <Text>{loading ? 'loading' : (deletion?.deleteAfter ?? 'staying')}</Text>;
  }
  session.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
  myHouse.mockResolvedValue(FLAT);
  jest.mocked(deletionStatus).mockResolvedValueOnce({ deleteAfter: '2026-11-29T09:00:00Z', requestedBy: 'self' });
  const view = await render(
    <MembershipProvider>
      <Deleting />
    </MembershipProvider>,
  );
  expect(await screen.findByText('2026-11-29T09:00:00Z')).toBeOnTheScreen();
  await view.unmount();

  jest.mocked(deletionStatus).mockRejectedValueOnce(new Error('offline'));
  await render(
    <MembershipProvider>
      <Deleting />
    </MembershipProvider>,
  );
  expect(await screen.findByText('staying')).toBeOnTheScreen();
});

describe('your language', () => {
  function Speaking() {
    const { loading } = useMembership();
    const { language, change } = useLanguage();
    const words = useWords();
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="test language" onPress={() => void change('en-XA').catch(() => undefined)}>
        <Text>{loading ? 'loading' : `${language}: ${words('house.lower.language')}`}</Text>
      </Pressable>
    );
  }

  async function speak() {
    await render(
      <MembershipProvider>
        <Speaking />
      </MembershipProvider>,
    );
  }

  beforeEach(() => {
    session.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
    myHouse.mockResolvedValue(FLAT);
  });

  it('reads the words in the language you picked', async () => {
    jest.mocked(myLanguage).mockResolvedValueOnce('en-XA');
    await speak();
    expect(await screen.findByText('en-XA: [Ļáñĝúáĝé]')).toBeOnTheScreen();
    expect(setMyLanguage).not.toHaveBeenCalled();
  });

  it("saves your phone's language the first time, when none is saved", async () => {
    jest.mocked(myLanguage).mockResolvedValueOnce(null);
    await speak();
    expect(await screen.findByText('en: Language')).toBeOnTheScreen();
    expect(setMyLanguage).toHaveBeenCalledWith('en');
  });

  it("reads your phone's language before you've signed in, and when yours can't be read", async () => {
    jest.mocked(deviceLanguage).mockReturnValue('en');
    jest.mocked(myLanguage).mockRejectedValueOnce(new Error('offline'));
    await speak();
    expect(await screen.findByText('en: Language')).toBeOnTheScreen();
    expect(setMyLanguage).not.toHaveBeenCalled();
  });

  it('changes at once, and goes back if it can’t be saved', async () => {
    await speak();
    expect(await screen.findByText('en: Language')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'test language' }));
    expect(await screen.findByText('en-XA: [Ļáñĝúáĝé]')).toBeOnTheScreen();
    expect(setMyLanguage).toHaveBeenCalledWith('en-XA');

    jest.mocked(setMyLanguage).mockRejectedValueOnce(new Error('offline'));
    await fireEvent.press(screen.getByRole('button', { name: 'test language' }));
    expect(await screen.findByText('en-XA: [Ļáñĝúáĝé]')).toBeOnTheScreen();
  });
});
