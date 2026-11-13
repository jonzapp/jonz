// The decision `npm run release:ios` / `release:android` makes before it
// builds anything, as a pure function so a unit test can hold it (lib.test.ts,
// beside this file). The build itself lives in scripts/release.mjs.

const STORES = { ios: "App Store", android: "Google Play" };

/**
 * Why a release must not go ahead, as `{ code, message }`, or null when it
 * may. A store stays off until release-targets.json says exactly `true` for
 * it, which waits on that store's account and the EAS project.
 */
export function releaseRefusal(platform, targets, hasEasConfig) {
  if (!Object.hasOwn(STORES, platform)) {
    return { code: 2, message: "Usage: npm run release:ios | npm run release:android" };
  }
  const store = STORES[platform];
  if (targets?.[platform] !== true) {
    return {
      code: 1,
      message:
        `${store} releases are switched off. Set "${platform}": true in release-targets.json ` +
        `once the ${store} account and EAS project are set up.`,
    };
  }
  if (!hasEasConfig) {
    return {
      code: 1,
      message: "apps/client/eas.json is missing. Run `npx eas-cli@latest build:configure` in apps/client first.",
    };
  }
  return null;
}
