// The app sits in a SafeAreaProvider (Expo Router's); a component rendered
// alone in a test doesn't, so it gets the library's own stand-in: no notch,
// no home bar.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// On a phone the session and the look are kept in SQLite (expo-sqlite's
// localStorage), a native module Jest can't load; tests get the same
// interface in memory (a test that reads it clears it first).
jest.mock('./src/api/storage', () => {
  const items = new Map();
  const storage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
  return { authStorage: storage };
});

// Cloudflare's bot check runs in a web view on a phone (react-native-webview,
// a native module Jest can't load). Tests get one that passes at once, and
// again after each reset, as the real one does a moment later.
jest.mock('./src/components/bot-check', () => {
  const { useEffect } = require('react');
  return {
    BotCheck: ({ onToken, round }) => {
      useEffect(() => onToken('test-token'), [round]);
      return null;
    },
  };
});

// Every test file starts at the same pretend time (src/testing/clock.ts), so
// none depends on when it runs. Only "now" is pretend: timers and promises
// run as usual, and a test that wants pretend timers too still asks Jest
// for them. The real Date with only "now" changed, rather than Jest's own
// pretend date: @date-fns/tz builds its dates on whichever Date it finds
// when it loads, and needs the real one's methods.
const RealDate = Date;
const PRETEND_NOW = RealDate.parse('2026-11-11T12:00:00Z');
const pretendNow = () => PRETEND_NOW;
global.Date = new Proxy(RealDate, {
  construct: (target, args, newTarget) => Reflect.construct(target, args.length === 0 ? [PRETEND_NOW] : args, newTarget),
  apply: () => new RealDate(PRETEND_NOW).toString(),
  get: (target, key) => (key === 'now' ? pretendNow : Reflect.get(target, key)),
});
