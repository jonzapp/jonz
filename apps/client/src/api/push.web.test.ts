// The web build's reminders, with the browser's push pieces stood in for:
// Jest runs as a phone, so this loads push.web.ts by name.

const mockCall = jest.fn();

jest.mock('./v1', () => ({ callV1: (...args: unknown[]) => mockCall(...args) }));

const KEY = 'BElgmKkqVZ9w0b2u4SWyR3cBfJ9L8i0n4b-Q_aXv8FfQ2Ay3xlNkUvO1sYQ9u0g5O1mF3a2-PlS6qA7ZbV9h1eQ';

type Push = typeof import('./push.web');

/** push.web.ts as a browser with these pieces would run it. */
function load(env: { key?: string; browser?: boolean } = {}): Push {
  process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY = env.key ?? KEY;
  let mod: Push | undefined;
  jest.isolateModules(() => {
    // A fresh copy, so it reads the key set just above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./push.web');
  });
  return mod!;
}

const subscription = {
  endpoint: 'https://push.example/abc',
  toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p-key', auth: 'a-key' } }),
  unsubscribe: jest.fn(async () => true),
};
const pushManager = { subscribe: jest.fn(async () => subscription), getSubscription: jest.fn(async () => null as unknown) };
const registration = { pushManager };
const serviceWorker = {
  register: jest.fn(async () => registration),
  getRegistration: jest.fn(async () => registration as unknown),
  ready: Promise.resolve(registration),
};
const Notification = { requestPermission: jest.fn(async () => 'granted') };

beforeEach(() => {
  jest.clearAllMocks();
  mockCall.mockResolvedValue(null);
  Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker }, configurable: true });
  Object.assign(globalThis, { window: globalThis, PushManager: function PushManager() {}, Notification });
});

afterAll(() => {
  delete process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
});

describe('reminderSupport', () => {
  it('offers nothing without the VAPID key', () => {
    expect(load({ key: '' }).reminderSupport()).toBe('none');
  });

  it("says so in a browser that can't take notifications", () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    expect(load().reminderSupport()).toBe('unsupported');
  });

  it('is ready with a key, a service worker, the Push API and notifications', () => {
    expect(load().reminderSupport()).toBe('ready');
  });
});

describe('keyBytes', () => {
  it('turns URL-safe, unpadded base64 into bytes', () => {
    const { keyBytes } = load();
    expect(Array.from(keyBytes('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(keyBytes('-_8'))).toEqual([251, 255]);
    expect(keyBytes(KEY)).toHaveLength(65);
  });
});

describe('turnRemindersOn', () => {
  it('subscribes with the key, and saves the subscription as yours in place of any old one', async () => {
    const push = load();
    expect(await push.turnRemindersOn('ava')).toBe('on');
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: push.keyBytes(KEY) });
    expect(mockCall.mock.calls).toEqual([['add_push_device', { endpoint: 'https://push.example/abc', p256dh: 'p-key', auth: 'a-key' }]]);
  });

  it('stops when the browser is told no', async () => {
    Notification.requestPermission.mockResolvedValueOnce('denied');
    expect(await load().turnRemindersOn('ava')).toBe('blocked');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(mockCall).not.toHaveBeenCalled();
  });

  it("throws when /v1 won't keep it", async () => {
    mockCall.mockRejectedValue(new Error('You can’t do that.'));
    await expect(load().turnRemindersOn('ava')).rejects.toThrow('You can’t do that.');
  });
});

describe('remindersOn and turnRemindersOff', () => {
  it('reads whether this browser is subscribed', async () => {
    const push = load();
    expect(await push.remindersOn()).toBe(false);
    pushManager.getSubscription.mockResolvedValueOnce(subscription);
    expect(await push.remindersOn()).toBe(true);
    serviceWorker.getRegistration.mockResolvedValueOnce(undefined);
    expect(await push.remindersOn()).toBe(false);
  });

  it('forgets the subscription on /v1, then in the browser', async () => {
    pushManager.getSubscription.mockResolvedValueOnce(subscription);
    await load().turnRemindersOff();
    expect(mockCall.mock.calls).toEqual([['remove_push_device', { endpoint: 'https://push.example/abc' }]]);
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('has nothing to do when there is no subscription', async () => {
    await load().turnRemindersOff();
    expect(mockCall).not.toHaveBeenCalled();
  });
});
