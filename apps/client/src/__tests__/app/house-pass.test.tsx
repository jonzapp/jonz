import { LEGAL, wordsFor } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { ApiRequestError } from '@/api/http';
import { leaveFor, passBillingUrl, passCheckoutOpen, passCheckoutUrl } from '@/api/pass';
import PassScreen from '@/app/(house)/house/pass';
import { ToastProvider } from '@/components/toast';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('@/api/pass', () => ({
  passCheckoutOpen: jest.fn(() => false),
  passCheckoutUrl: jest.fn(),
  passBillingUrl: jest.fn(),
  leaveFor: jest.fn(),
}));
jest.mock('@/api/supabase', () => ({ supabase: {} }));
jest.mock('@/locale', () => ({ deviceTimeZone: () => 'Europe/London' }));
jest.mock('@/hooks/use-membership', () => ({
  useMembership: () => ({ session: { user: { id: 'priya' } }, house: { id: 'h1', name: 'Flat 3' } }),
}));

const DAY = 86_400_000;

function withPass(pass: ReturnType<typeof snapshot>['house']['pass']) {
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue({ ...base, house: { ...base.house, pass } });
}

function Page() {
  return (
    <ToastProvider>
      <PassScreen />
    </ToastProvider>
  );
}

async function open(url = '/house/pass') {
  await renderPages({ 'house/pass': Page }, url);
  await untilRead(words);
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (passCheckoutOpen as jest.Mock).mockReturnValue(false);
});

it('sits under a title bar with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: words('common.title.pass') })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: words('common.shell.backTo', { place: words('common.section.house') }) })).toBeOnTheScreen();
});

it('is the Family Pass in a family, with what a family gets', async () => {
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue({ ...base, house: { ...base.house, kind: 'family' } });
  await open();
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: words('house.familyPass.title') })).toBeOnTheScreen();
  expect(screen.getByTestId('pass-lead')).toHaveTextContent(words('house.familyPass.foundingLead'));
  expect(screen.getByText(words('house.familyPass.includes'))).toBeOnTheScreen();
  expect(screen.getByText(words('house.familyPass.pocket'))).toBeOnTheScreen();
  expect(screen.getByText(words('house.familyPass.kids'))).toBeOnTheScreen();
  expect(screen.queryByText(words('house.pass.card.money'))).toBeNull();
});

it('tells a house given the Pass for good, and offers it no plans', async () => {
  await open();
  expect(screen.getByTestId('pass-lead')).toHaveTextContent(words('house.pass.foundingLead'));
  expect(screen.getByTestId('pass-line')).toHaveTextContent(words('house.pass.founding'));
  expect(screen.getByText(words('house.pass.card.money'))).toBeOnTheScreen();
  expect(screen.queryByTestId('pass-plans')).toBeNull();
  expect(screen.queryByTestId('pass-soon')).toBeNull();
  expect(screen.getByTestId('pass-money')).toHaveTextContent(words('house.pass.money'));
  expect(screen.queryByTestId('pass-ask-free')).toBeNull();
});

it('says where the money goes, and offers a free Pass only once the free month has ended', async () => {
  withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY), buyerId: null });
  await open();
  expect(screen.getByTestId('pass-money')).toHaveTextContent(words('house.pass.money'));
  expect(screen.queryByTestId('pass-ask-free')).toBeNull();
});

it('lets a house past its free month ask for the Pass free', async () => {
  withPass({ plan: 'trial', until: new Date(Date.now() - DAY), buyerId: null });
  await open();
  expect(screen.getByTestId('pass-hardship')).toHaveTextContent(words('house.pass.hardship'));
  expect(screen.getByRole('link', { name: words('house.pass.askFree') })).toBeOnTheScreen();
  expect(LEGAL.email).toContain('@');
});

it('shows a house on its free month the plans in its own currency, Yearly first, not yet for sale', async () => {
  withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY - 60_000), buyerId: null });
  await open();
  expect(screen.getByTestId('pass-lead')).toHaveTextContent(words('house.pass.lead'));
  expect(screen.getByTestId('pass-line')).toHaveTextContent(words('house.pass.trialLeft', { days: 12 }));
  const plans = within(screen.getByTestId('pass-plans'));
  for (const price of ['£29.99 a year', '£3.99 a month']) expect(plans.getByText(price)).toBeOnTheScreen();
  expect(within(screen.getByTestId('plan-yearly')).getByText(words('house.pass.yearly'))).toBeOnTheScreen();
  expect(screen.getByTestId('pass-soon')).toHaveTextContent(words('house.pass.buyingSoon'));
});

it('says who bought it', async () => {
  withPass({ plan: 'yearly', until: new Date(Date.now() + 200 * DAY), buyerId: 'sam' });
  await open();
  expect(screen.getByTestId('pass-line')).toHaveTextContent(words('house.pass.boughtBy', { name: 'Sam' }), { exact: false });
});

describe('selling on the web', () => {
  beforeEach(() => {
    (passCheckoutOpen as jest.Mock).mockReturnValue(true);
  });

  it('sends a house on its free month to Checkout for the plan pressed, and says when it first pays', async () => {
    withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY - 60_000), buyerId: null });
    (passCheckoutUrl as jest.Mock).mockResolvedValue('https://checkout.stripe.com/c/pay/cs_test_1');
    await open();
    expect(screen.queryByTestId('pass-soon')).toBeNull();
    expect(screen.getByTestId('pass-first-charge')).toHaveTextContent('Nothing to pay until your free month ends on', { exact: false });
    await fireEvent.press(screen.getByTestId('plan-yearly'));
    await waitFor(() => expect(leaveFor).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1'));
    expect(passCheckoutUrl).toHaveBeenCalledWith('h1', 'yearly');
  });

  it('says why not when the API refuses, and stays put', async () => {
    withPass({ plan: 'trial', until: new Date(Date.now() - DAY), buyerId: null });
    (passCheckoutUrl as jest.Mock).mockRejectedValue(new ApiRequestError(words('house.pass.checkoutClosed'), 503));
    await open();
    expect(screen.queryByTestId('pass-first-charge')).toBeNull();
    await fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(await screen.findByText(words('house.pass.checkoutClosed'))).toBeOnTheScreen();
    expect(leaveFor).not.toHaveBeenCalled();
  });

  it('gives the buyer of a paid plan Manage plan, and no plans to buy', async () => {
    withPass({ plan: 'monthly', until: new Date(Date.now() + 20 * DAY), buyerId: 'priya' });
    (passBillingUrl as jest.Mock).mockResolvedValue('https://billing.stripe.com/p/session/test_1');
    await open();
    expect(screen.queryByTestId('plan-yearly')).toBeNull();
    expect(screen.queryByTestId('plan-monthly')).toBeNull();
    expect(screen.queryByTestId('plan-founding')).toBeNull();
    await fireEvent.press(screen.getByTestId('pass-manage'));
    await waitFor(() => expect(leaveFor).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test_1'));
    expect(passBillingUrl).toHaveBeenCalledWith('h1');
  });

  it('offers Manage plan only to the housemate who bought it', async () => {
    withPass({ plan: 'yearly', until: new Date(Date.now() + 200 * DAY), buyerId: 'sam' });
    await open();
    expect(screen.queryByTestId('pass-manage')).toBeNull();
  });

  it('thanks the buyer back from Checkout until the Pass shows', async () => {
    withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY), buyerId: null });
    await open('/house/pass?bought=1');
    expect(screen.getByTestId('pass-bought')).toHaveTextContent(words('house.pass.bought'));
  });
});

