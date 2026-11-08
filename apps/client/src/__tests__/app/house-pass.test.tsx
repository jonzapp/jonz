import { FAMILY_PASS_COPY, FOCUS_SHELL_COPY, LEGAL, PAGE_TITLE, PASS_COPY, SECTION_LABEL } from '@app/core';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { loadHouse } from '@/api/board';
import { catchUp } from '@/api/house';
import { ApiRequestError } from '@/api/http';
import { leaveFor, passBillingUrl, passCheckoutOpen, passCheckoutUrl, passSelling } from '@/api/pass';
import PassScreen from '@/app/(house)/house/pass';
import { ToastProvider } from '@/components/toast';
import { snapshot } from '@/testing/house';
import { renderPages, untilRead } from '@/testing/pages';

jest.mock('@/api/board', () => ({ loadHouse: jest.fn() }));
jest.mock('@/api/house', () => ({ catchUp: jest.fn() }));
jest.mock('@/api/auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('@/api/pass', () => ({
  passCheckoutOpen: jest.fn(() => false),
  passSelling: jest.fn(() => false),
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
  await untilRead();
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadHouse as jest.Mock).mockResolvedValue(snapshot());
  (catchUp as jest.Mock).mockResolvedValue(false);
  (passCheckoutOpen as jest.Mock).mockReturnValue(false);
  (passSelling as jest.Mock).mockReturnValue(false);
});

it('sits under a title bar with the way back to House', async () => {
  await open();
  const bar = within(screen.getByTestId('title-bar'));
  expect(bar.getByRole('header', { name: PAGE_TITLE.pass })).toBeOnTheScreen();
  expect(bar.getByRole('button', { name: FOCUS_SHELL_COPY.backTo(SECTION_LABEL.house) })).toBeOnTheScreen();
});

it('is the Family Pass in a family, with what a family gets', async () => {
  const base = snapshot();
  (loadHouse as jest.Mock).mockResolvedValue({ ...base, house: { ...base.house, kind: 'family' } });
  await open();
  expect(within(screen.getByTestId('title-bar')).getByRole('header', { name: FAMILY_PASS_COPY.title })).toBeOnTheScreen();
  expect(screen.getByTestId('pass-lead')).toHaveTextContent(FAMILY_PASS_COPY.foundingLead);
  expect(screen.getByText(FAMILY_PASS_COPY.includes)).toBeOnTheScreen();
  expect(screen.getByText(FAMILY_PASS_COPY.pocket)).toBeOnTheScreen();
  expect(screen.getByText(FAMILY_PASS_COPY.kids)).toBeOnTheScreen();
  expect(screen.queryByText(PASS_COPY.stake)).toBeNull();
});

it('thanks a Founding house, and offers it no plans', async () => {
  await open();
  expect(screen.getByTestId('pass-lead')).toHaveTextContent(PASS_COPY.foundingLead);
  expect(screen.getByTestId('pass-line')).toHaveTextContent(PASS_COPY.founding);
  expect(screen.getByText(PASS_COPY.stake)).toBeOnTheScreen();
  expect(screen.queryByTestId('pass-plans')).toBeNull();
  expect(screen.queryByTestId('pass-soon')).toBeNull();
  expect(screen.getByTestId('pass-money')).toHaveTextContent(PASS_COPY.money);
  expect(screen.queryByTestId('pass-ask-free')).toBeNull();
});

it('says where the money goes, and offers a free Pass only once the free month has ended', async () => {
  withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY), buyerId: null });
  await open();
  expect(screen.getByTestId('pass-money')).toHaveTextContent(PASS_COPY.money);
  expect(screen.queryByTestId('pass-ask-free')).toBeNull();
});

it('lets a house past its free month ask for the Pass free', async () => {
  withPass({ plan: 'trial', until: new Date(Date.now() - DAY), buyerId: null });
  await open();
  expect(screen.getByTestId('pass-hardship')).toHaveTextContent(PASS_COPY.hardship);
  expect(screen.getByRole('link', { name: PASS_COPY.askFree })).toBeOnTheScreen();
  expect(LEGAL.email).toContain('@');
});

it('shows a house on its free month the plans in its own currency, Yearly first, not yet for sale', async () => {
  withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY - 60_000), buyerId: null });
  await open();
  expect(screen.getByTestId('pass-lead')).toHaveTextContent(PASS_COPY.lead);
  expect(screen.getByTestId('pass-line')).toHaveTextContent(PASS_COPY.trialLeft(12));
  const plans = within(screen.getByTestId('pass-plans'));
  for (const price of ['£39.99 a year', '£4.99 a month', '£54.99 once']) expect(plans.getByText(price)).toBeOnTheScreen();
  expect(within(screen.getByTestId('plan-yearly')).getByText(PASS_COPY.yearly)).toBeOnTheScreen();
  expect(screen.getByTestId('pass-soon')).toHaveTextContent(PASS_COPY.buyingSoon);
});

it('says who bought it', async () => {
  withPass({ plan: 'yearly', until: new Date(Date.now() + 200 * DAY), buyerId: 'sam' });
  await open();
  expect(screen.getByTestId('pass-line')).toHaveTextContent(PASS_COPY.boughtBy('Sam'), { exact: false });
});

describe('selling on the web', () => {
  beforeEach(() => {
    (passCheckoutOpen as jest.Mock).mockReturnValue(true);
    (passSelling as jest.Mock).mockReturnValue(true);
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
    (passCheckoutUrl as jest.Mock).mockRejectedValue(new ApiRequestError(PASS_COPY.checkoutClosed, 503));
    await open();
    expect(screen.queryByTestId('pass-first-charge')).toBeNull();
    await fireEvent.press(screen.getByTestId('plan-monthly'));
    expect(await screen.findByText(PASS_COPY.checkoutClosed)).toBeOnTheScreen();
    expect(leaveFor).not.toHaveBeenCalled();
  });

  it('gives the buyer of a paid plan Manage plan, and offers only Founding', async () => {
    withPass({ plan: 'monthly', until: new Date(Date.now() + 20 * DAY), buyerId: 'priya' });
    (passBillingUrl as jest.Mock).mockResolvedValue('https://billing.stripe.com/p/session/test_1');
    await open();
    expect(screen.queryByTestId('plan-yearly')).toBeNull();
    expect(screen.queryByTestId('plan-monthly')).toBeNull();
    expect(screen.getByTestId('plan-founding')).toBeOnTheScreen();
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
    expect(screen.getByTestId('pass-bought')).toHaveTextContent(PASS_COPY.bought);
  });
});

describe('during the beta, with checkout on and nothing locked', () => {
  beforeEach(() => {
    (passCheckoutOpen as jest.Mock).mockReturnValue(true);
  });

  it('says it is free and sells nothing', async () => {
    withPass({ plan: 'trial', until: new Date(Date.now() + 12 * DAY), buyerId: null });
    await open();
    expect(screen.getByTestId('pass-soon')).toHaveTextContent(PASS_COPY.betaFree);
    await fireEvent.press(screen.getByTestId('plan-yearly'));
    expect(passCheckoutUrl).not.toHaveBeenCalled();
  });

  it('still lets a buyer manage the plan they hold', async () => {
    withPass({ plan: 'monthly', until: new Date(Date.now() + 20 * DAY), buyerId: 'priya' });
    await open();
    expect(screen.getByTestId('pass-manage')).toBeOnTheScreen();
  });
});
