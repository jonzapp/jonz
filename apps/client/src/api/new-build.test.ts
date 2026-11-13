import { isNewBuildError, reloadOntoNewBuild } from './new-build';

/** What iPhone Safari and Chrome said, tapping Week on a page opened before a deploy (12 Nov 2026). */
const WEEK = new Error(
  'Loading module https://jonz.app/_expo/static/js/web/index-ede335d3d8516b6e53fbb866f9351ff5.js failed.\n' +
    '(error: https://jonz.app/_expo/static/js/web/index-ede335d3d8516b6e53fbb866f9351ff5.js)',
);

describe('a page left open across a deploy', () => {
  it.each([
    ['Expo’s loader', WEEK],
    ['Chrome', new TypeError('Failed to fetch dynamically imported module: https://jonz.app/_expo/static/js/web/x-1.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['Firefox', new TypeError('error loading dynamically imported module: https://jonz.app/_expo/static/js/web/x-1.js')],
    ['a chunk loader', Object.assign(new Error('Loading chunk 7 failed.'), { name: 'ChunkLoadError' })],
  ])('knows a bundle that is gone, as %s says it', (_, error) => {
    expect(isNewBuildError(error)).toBe(true);
  });

  it('leaves any other error to the error screen', () => {
    expect(isNewBuildError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isNewBuildError(new Error('Something went wrong. Try again.'))).toBe(false);
    expect(isNewBuildError(null)).toBe(false);
  });

  function page(saved: Record<string, string> = {}) {
    const store = { ...saved };
    return {
      store,
      reload: jest.fn(),
      storage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) },
    };
  }
  const at = (iso: string) => new Date(iso).getTime();

  it('reloads onto the new build', () => {
    const p = page();
    expect(reloadOntoNewBuild(WEEK, { ...p, now: at('2026-11-12T15:45:00Z') })).toBe(true);
    expect(p.reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload for any other error", () => {
    const p = page();
    expect(reloadOntoNewBuild(new Error('boom'), { ...p, now: at('2026-11-12T15:45:00Z') })).toBe(false);
    expect(p.reload).not.toHaveBeenCalled();
  });

  it('reloads once: if the new page fails the same way straight after, the error screen shows instead of a loop', () => {
    const p = page();
    reloadOntoNewBuild(WEEK, { ...p, now: at('2026-11-12T15:45:00Z') });
    expect(reloadOntoNewBuild(WEEK, { ...p, now: at('2026-11-12T15:45:20Z') })).toBe(false);
    expect(p.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for the next deploy, a while later', () => {
    const p = page();
    reloadOntoNewBuild(WEEK, { ...p, now: at('2026-11-12T15:45:00Z') });
    expect(reloadOntoNewBuild(WEEK, { ...p, now: at('2026-11-12T18:00:00Z') })).toBe(true);
    expect(p.reload).toHaveBeenCalledTimes(2);
  });

  it('still reloads where the browser keeps nothing (a private window)', () => {
    const reload = jest.fn();
    const storage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(reloadOntoNewBuild(WEEK, { storage, reload, now: at('2026-11-12T15:45:00Z') })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
