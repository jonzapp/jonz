import { Platform } from 'react-native';

import { passBillingUrl, passCheckoutOpen, passCheckoutUrl } from './pass';
import { callV1 } from './v1';

jest.mock('./v1', () => ({ callV1: jest.fn() }));

const post = callV1 as jest.Mock;
const HOUSE = '8f14e45f-ceea-467f-a8f5-2fbf7c2d9b1a';
const saved = { os: Platform.OS, flag: process.env.EXPO_PUBLIC_PASS_CHECKOUT };

beforeEach(() => {
  jest.clearAllMocks();
  post.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
});

afterEach(() => {
  Platform.OS = saved.os;
  process.env.EXPO_PUBLIC_PASS_CHECKOUT = saved.flag;
});

describe('passCheckoutOpen', () => {
  it('sells only on the web, and only with the switch on', () => {
    Platform.OS = 'web';
    process.env.EXPO_PUBLIC_PASS_CHECKOUT = 'on';
    expect(passCheckoutOpen()).toBe(true);
    process.env.EXPO_PUBLIC_PASS_CHECKOUT = '';
    expect(passCheckoutOpen()).toBe(false);
    Platform.OS = 'ios';
    process.env.EXPO_PUBLIC_PASS_CHECKOUT = 'on';
    expect(passCheckoutOpen()).toBe(false);
  });
});

describe('passCheckoutUrl and passBillingUrl', () => {
  it('ask /v1 for the house and the plan, and answer where to go', async () => {
    await expect(passCheckoutUrl(HOUSE, 'yearly')).resolves.toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(post).toHaveBeenCalledWith('pass_checkout', { houseId: HOUSE, plan: 'yearly' });
    await passBillingUrl(HOUSE);
    expect(post).toHaveBeenCalledWith('pass_billing', { houseId: HOUSE });
  });

  it('never sends a plan that isn’t for sale', async () => {
    await expect(passCheckoutUrl(HOUSE, 'trial' as never)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
