import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// vercel.json is how jonz.app serves the web build (the `jonz-web`
// project, Root Directory apps/client). JSON takes no comments, so the why
// lives here.

interface Rule {
  source: string;
  has?: { type: string; key?: string; value: string }[];
  destination?: string;
  permanent?: boolean;
  headers?: { key: string; value: string }[];
}

const config = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8')) as {
  framework: null;
  buildCommand: string;
  relatedProjects?: string[];
  outputDirectory: string;
  redirects: Rule[];
  rewrites: Rule[];
  headers: Rule[];
};
const headersFor = (source: string) => config.headers.find((h) => h.source === source)?.headers ?? [];

describe("jonz.app's web build on Vercel", () => {
  it('builds the single-page export, with no framework guessed', () => {
    expect(config.framework).toBeNull();
    // scripts/build-web.mjs runs `npm run export:web`; a preview calls
    // staging's API, never its own branch's (Vercel Authentication), so
    // there's no related project to look up.
    expect(config.buildCommand).toBe('node scripts/build-web.mjs');
    expect(config.relatedProjects).toBeUndefined();
    expect(config.outputDirectory).toBe('dist');
  });

  it('keeps staging out of search engines', () => {
    expect(config.headers).toContainEqual({
      source: '/(.*)',
      has: [{ type: 'host', value: 'staging.jonz.app' }],
      headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    });
  });

  it("passes /api/*, /v1/*, /files/* and /auth/v1/* on to apps/api before anything else, so the clock's URL, the app's calls, its pictures and sign-in stay put", () => {
    expect(config.rewrites.slice(0, 4)).toEqual([
      { source: '/api/:path*', destination: 'https://api.jonz.app/api/:path*' },
      { source: '/v1/:path*', destination: 'https://api.jonz.app/v1/:path*' },
      { source: '/files/:path*', destination: 'https://api.jonz.app/files/:path*' },
      { source: '/auth/v1/:path*', destination: 'https://api.jonz.app/auth/v1/:path*' },
    ]);
  });

  it('never caches what the API answers', () => {
    expect(headersFor('/api/:path*')).toContainEqual({ key: 'x-vercel-enable-rewrite-caching', value: '0' });
    expect(headersFor('/v1/:path*')).toContainEqual({ key: 'x-vercel-enable-rewrite-caching', value: '0' });
    expect(headersFor('/files/:path*')).toContainEqual({ key: 'x-vercel-enable-rewrite-caching', value: '0' });
    expect(headersFor('/auth/v1/:path*')).toContainEqual({ key: 'x-vercel-enable-rewrite-caching', value: '0' });
  });

  it("sends the old Wall, Stake and Table links on to their places under House, as the app's router does", () => {
    // On a phone and inside the app the router follows app.json's redirects.
    // A web page opened cold on one would get the router's own redirect
    // screen, which leaves a wrong address behind (/house/house/wall), so the
    // host sends it on before the app loads. Not permanent: a browser would
    // keep a permanent one for good.
    const app = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8'));
    const router = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-router')[1];
    expect(config.redirects).toEqual(
      router.redirects.map((r: Rule) => ({ source: r.source, destination: r.destination, permanent: false })),
    );
  });

  describe("a pasted link's card", () => {
    // The app draws itself in the browser, and the bots that make a chat's
    // link cards don't run it, so they're sent to apps/api's page of card tags
    // (packages/core/src/share.ts) by their user agent. People get the app.
    const [root, page] = config.rewrites.slice(4, 6);
    const bots = new RegExp(`^${root.has![0].value}$`);

    it('sends the chat apps\' bots, and only them, to the card page, front door and every page alike', () => {
      expect(root).toMatchObject({ source: '/', destination: 'https://api.jonz.app/api/share' });
      expect(page).toMatchObject({
        source: '/:path((?!api/|v1/|files/|auth/v1/|_expo/)[^.]*)',
        destination: 'https://api.jonz.app/api/share/:path',
      });
      expect(page.has).toEqual(root.has);
      expect(root.has![0]).toMatchObject({ type: 'header', key: 'user-agent' });
    });

    it.each([
      ['iMessage', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0'],
      ['WhatsApp', 'WhatsApp/2.23.20.0 A'],
      ['Slack', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
      ['Telegram', 'TelegramBot (like TwitterBot)'],
      ['Discord', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
    ])('knows %s', (_app, agent) => {
      expect(bots.test(agent)).toBe(true);
    });

    it('leaves people, and search engines, on the app', () => {
      expect(bots.test('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false);
      expect(bots.test('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(false);
    });

    it("never sends files a card needs (og.png) or the app's bundles to it", () => {
      const pattern = /^\/((?!api\/|_expo\/)[^.]*)$/;
      expect(pattern.test('/join/TRC4QX7M')).toBe(true);
      expect(pattern.test('/house/wall')).toBe(true);
      expect(pattern.test('/og.png')).toBe(false);
      expect(pattern.test('/api/og/join/TRC4QX7M')).toBe(false);
      expect(pattern.test('/_expo/static/js/web/entry.js')).toBe(false);
    });
  });

  it('opens any other path on the app, which draws its own not-found', () => {
    expect(config.rewrites.at(-1)).toEqual({ source: '/(.*)', destination: '/index.html' });
    expect(config.rewrites).toHaveLength(7);
  });

  it('sends the headers the Next app sends (apps/api/next.config.ts)', () => {
    expect(Object.fromEntries(headersFor('/(.*)').map((h) => [h.key, h.value]))).toEqual({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
  });

  it('never serves the service worker stale, and keeps the hashed bundles for good', () => {
    expect(headersFor('/sw.js')).toEqual([{ key: 'Cache-Control', value: 'no-cache' }]);
    expect(headersFor('/_expo/static/(.*)')).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
  });
});
