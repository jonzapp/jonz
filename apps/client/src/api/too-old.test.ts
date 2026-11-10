import { Platform } from 'react-native';

import { isTooOld, markTooOld, resetTooOld, storeUrl } from './too-old';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { android: { package: 'dev.glyn.jonz' }, extra: { appStoreId: '1234567890' } } },
}));

describe('too old', () => {
  afterEach(resetTooOld);

  it('stays off until the API says so, then stays on', () => {
    expect(isTooOld()).toBe(false);
    markTooOld();
    markTooOld();
    expect(isTooOld()).toBe(true);
  });

  it("sends a phone to its own store", () => {
    const url = storeUrl();
    if (Platform.OS === 'android') expect(url).toBe('https://play.google.com/store/apps/details?id=dev.glyn.jonz');
    else if (Platform.OS === 'ios') expect(url).toBe('https://apps.apple.com/app/id1234567890');
    else expect(url).toBeNull();
  });
});
