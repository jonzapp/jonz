import { Platform } from 'react-native';

import { apiBase } from './base';

describe('apiBase', () => {
  const saved = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.EXPO_PUBLIC_API_URL = saved;
  });

  it('is the API named, without a trailing slash', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/';
    expect(apiBase()).toBe('https://api.example.test');
  });

  it("is the page's own origin on the web when none is named", () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    process.env.EXPO_PUBLIC_API_URL = '';
    expect(apiBase()).toBe('');
  });

  it('must be named on a phone, which has no origin', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    delete process.env.EXPO_PUBLIC_API_URL;
    expect(() => apiBase()).toThrow('Missing EXPO_PUBLIC_API_URL');
  });
});
