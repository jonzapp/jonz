import { TURNSTILE_SITE_KEY, TURNSTILE_TEST_KEY, turnstileKey, turnstilePage } from './turnstile';

describe('the bot check', () => {
  it('uses the real key on jonz.app and on a phone, and the always-pass key anywhere else', () => {
    expect(turnstileKey('jonz.app')).toBe(TURNSTILE_SITE_KEY);
    expect(turnstileKey(null)).toBe(TURNSTILE_SITE_KEY);
    expect(turnstileKey('staging.jonz.app')).toBe(TURNSTILE_TEST_KEY);
    expect(turnstileKey('localhost')).toBe(TURNSTILE_TEST_KEY);
  });

  it("gives a phone's web view the widget, shown only when it needs a tap", () => {
    const page = turnstilePage(TURNSTILE_SITE_KEY, 'dark');
    expect(page).toContain('challenges.cloudflare.com/turnstile/v0/api.js');
    expect(page).toContain(`"sitekey":"${TURNSTILE_SITE_KEY}"`);
    expect(page).toContain('"appearance":"interaction-only"');
    expect(page).toContain('"theme":"dark"');
    expect(page).toContain('ReactNativeWebView.postMessage');
  });
});
