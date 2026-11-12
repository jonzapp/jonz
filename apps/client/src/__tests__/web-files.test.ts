import { APP_NAME, BIN_NIGHT, SIGN, TAGLINE, TILE_RADIUS, signParts } from '@app/core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { START_SIGN } from '@/components/start-sign';

// public/ is served as it is, so it can't import the tokens: these keep its
// colours and words equal to core's, and its links pointing at real files.

const PUBLIC = join(__dirname, '../../public');
const read = (file: string) => readFileSync(join(PUBLIC, file), 'utf8');

describe('the page template', () => {
  const html = read('index.html');

  it("wears each look's ground in the browser's chrome", () => {
    expect(html).toContain(`media="(prefers-color-scheme: light)" content="${BIN_NIGHT.light.background}"`);
    expect(html).toContain(`media="(prefers-color-scheme: dark)" content="${BIN_NIGHT.dark.background}"`);
  });

  it("says the app's name and what it is", () => {
    expect(html).toContain(`<meta name="description" content="${TAGLINE}" />`);
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${APP_NAME}" />`);
    expect(html).toContain('<title>%WEB_TITLE%</title>');
  });

  it('has a tab icon, a home-screen icon and a card for pasted links, all there', () => {
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(html).toContain('<meta property="og:image" content="https://jonz.app/og.png" />');
    expect(html).toContain(`<meta property="og:description" content="${TAGLINE}" />`);
    for (const file of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'og.png']) {
      expect(existsSync(join(PUBLIC, file))).toBe(true);
    }
  });

  it('starts on the ground of each look, never white, with the J sign in the middle', () => {
    expect(html).toContain(`body { background-color: ${BIN_NIGHT.light.background}; }`);
    expect(html).toContain(`:root:not([data-look='light']) body { background-color: ${BIN_NIGHT.dark.background}; }`);
    expect(html).toContain(`:root[data-look='dark'] body { background-color: ${BIN_NIGHT.dark.background}; }`);
    // The sign as SignMark draws it (wordmark.tsx): ink on the amber tile by day, amber on the ground at night.
    const { frame, j } = signParts(SIGN);
    expect(html).toContain(`<rect width="512" height="512" rx="${TILE_RADIUS}" fill="${BIN_NIGHT.light.hivis}"/>`);
    for (const ink of [BIN_NIGHT.light.onHivis, BIN_NIGHT.dark.hivis]) {
      expect(html).toContain(
        `<rect x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}" rx="${frame.radius}" fill="none" stroke="${ink}" stroke-width="${frame.stroke}"/>`,
      );
      expect(html).toContain(`<path transform="${j.transform}" d="${j.d}" fill="none" stroke="${ink}" stroke-width="${j.stroke}"`);
    }
    // At night the frame alone fills the box, less a hair, as SignMark crops it.
    const from = frame.x - frame.stroke / 2 - 12;
    expect(html).toContain(`viewBox="${from} ${from} ${512 - 2 * from} ${512 - 2 * from}"`);
    // As big as the phone apps' splash draws it.
    expect(html).toContain(`.start svg { width: ${START_SIGN}px; height: ${START_SIGN}px; }`);
  });

  it('draws no scrollbar beside any scrolling area, even with a mouse plugged in', () => {
    expect(html).toContain('* { scrollbar-width: none; }');
    expect(html).toContain('*::-webkit-scrollbar { display: none; }');
  });

  it('is installable, and fits under a notch', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('viewport-fit=cover');
    expect(existsSync(join(PUBLIC, 'icon-192.png'))).toBe(true);
  });
});

describe('the manifest', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));

  it('opens on Today, standing alone, in the daylight ground', () => {
    expect(manifest).toMatchObject({
      name: APP_NAME,
      short_name: APP_NAME,
      description: TAGLINE,
      start_url: '/today',
      display: 'standalone',
      background_color: BIN_NIGHT.light.background,
      theme_color: BIN_NIGHT.light.background,
    });
  });

  it('points at icons that are there, a maskable one among them', () => {
    for (const icon of manifest.icons) expect(existsSync(join(PUBLIC, icon.src))).toBe(true);
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });
});

describe("Microsoft's proof that jonz.app is the sign-in app's domain", () => {
  // Entra reads it to set the app's publisher domain (Branding & properties).
  const association = JSON.parse(read('.well-known/microsoft-identity-association.json'));

  it('names the Jonz app registration, and only it', () => {
    expect(association).toEqual({
      associatedApplications: [{ applicationId: 'f769a77b-82be-4828-aef1-6c6dbc6ca8c0' }],
    });
  });
});

describe('the service worker', () => {
  const worker = read('sw.js');

  it('shows a reminder with the home-screen icon', () => {
    expect(worker).toContain('const ICON = "/icon-192.png"');
    expect(existsSync(join(PUBLIC, 'icon-192.png'))).toBe(true);
  });

  it('caches nothing: a stale list of Johns is worse than a spinner', () => {
    expect(worker).not.toMatch(/caches\.|addEventListener\("fetch"/);
  });
});

/**
 * The worker run for real, against a stand-in for the browser: what a push
 * shows, and what tapping it or one of its buttons does.
 */
describe('the service worker, run', () => {
  type Listener = (event: Record<string, unknown>) => void;

  function boot(fetchReply: { ok: boolean; body: unknown } | 'offline' = { ok: true, body: {} }) {
    const listeners: Record<string, Listener> = {};
    const shown: { title: string; options: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const posted: { url: string; body: unknown }[] = [];
    const self = {
      addEventListener: (name: string, fn: Listener) => (listeners[name] = fn),
      registration: {
        showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }),
      },
      clients: { matchAll: async () => [], openWindow: async (url: string) => void opened.push(url) },
    };
    const fetch = async (url: string, init: { body: string }) => {
      posted.push({ url, body: JSON.parse(init.body) });
      if (fetchReply === 'offline') throw new TypeError('Failed to fetch');
      return { ok: fetchReply.ok, json: async () => fetchReply.body };
    };
    new Function('self', 'fetch', read('sw.js'))(self, fetch);
    async function fire(name: string, event: Record<string, unknown>) {
      let done: Promise<unknown> = Promise.resolve();
      listeners[name]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
    }
    return { fire, shown, opened, posted };
  }

  const push = (message: unknown) => ({ data: { json: () => message } });
  const notification = (data: unknown, tag = 'john:1') => ({ title: 'Bins is due soon', tag, data, close: () => {} });

  it('shows the buttons a push carries, with its token, quietly in quiet hours', async () => {
    const w = boot();
    await w.fire(
      'push',
      push({
        title: 'Bins is due soon',
        body: 'Due today 19:00.',
        url: '/today',
        tag: 'john:1',
        silent: true,
        actions: [{ action: 'done', title: 'Done' }],
        token: 't',
      }),
    );
    expect(w.shown).toEqual([
      {
        title: 'Bins is due soon',
        options: expect.objectContaining({
          body: 'Due today 19:00.',
          tag: 'john:1',
          silent: true,
          actions: [{ action: 'done', title: 'Done' }],
          data: { url: '/today', token: 't' },
        }),
      },
    ]);
  });

  it('shows no buttons without a token', async () => {
    const w = boot();
    await w.fire('push', push({ title: 'Johns', body: '', url: '/today', actions: [{ action: 'done', title: 'Done' }] }));
    expect(w.shown[0].options.actions).toBeUndefined();
  });

  it('opens the page when the notification itself is tapped', async () => {
    const w = boot();
    await w.fire('notificationclick', { action: '', notification: notification({ url: '/week', token: 't' }) });
    expect(w.opened).toEqual(['/week']);
    expect(w.posted).toEqual([]);
  });

  it('posts a button with its token, and says it worked in place of the reminder', async () => {
    const w = boot({ ok: true, body: { ok: true, title: 'Bins ticked', body: 'The house can check it now.' } });
    await w.fire('notificationclick', { action: 'done', notification: notification({ url: '/today', token: 't' }) });
    expect(w.posted).toEqual([{ url: '/api/push-actions', body: { token: 't', action: 'done' } }]);
    expect(w.opened).toEqual([]);
    expect(w.shown).toEqual([
      {
        title: 'Bins ticked',
        options: expect.objectContaining({ body: 'The house can check it now.', tag: 'john:1', silent: true }),
      },
    ]);
  });

  it('says why a button didn’t work, and still opens the app when tapped', async () => {
    const w = boot({ ok: false, body: { error: 'That needs a photo first.' } });
    await w.fire('notificationclick', { action: 'done', notification: notification({ url: '/today', token: 't' }) });
    expect(w.shown[0]).toEqual({
      title: 'Bins is due soon',
      options: expect.objectContaining({ body: 'That needs a photo first.', data: { url: '/today' } }),
    });
  });

  it('says so when there is no connection', async () => {
    const w = boot('offline');
    await w.fire('notificationclick', { action: 'held', notification: notification({ url: '/week', token: 't' }) });
    expect(w.shown[0].options.body).toBe('Couldn’t do that from here. Tap to open Jonz.');
  });
});
