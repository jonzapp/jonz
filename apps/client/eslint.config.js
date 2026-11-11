// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const formatjs = require('eslint-plugin-formatjs');

const jonz = require('./eslint-rules/jonz');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  // The house style (docs/style/). The theme is where the raw values live;
  // tests may build what they need.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme.ts', 'src/**/*.test.{ts,tsx}', 'src/__tests__/**'],
    plugins: { jonz },
    rules: {
      'jonz/no-raw-colour': 'error',
      'jonz/no-raw-type-size': 'error',
      'jonz/spacing-from-scale': 'error',
      'jonz/no-hand-made-button-row': 'error',
      'jonz/button-in-row': 'error',
      'jonz/no-pressable-in-screens': 'error',
      'jonz/no-bare-spinner': 'error',
      'jonz/busy-not-disabled': 'error',
      'jonz/owner-only': 'error',
    },
  },
  // The app's words (docs/specs/translation.md): text on screen comes from
  // useWords(), never written into a screen. Even joins (", ", ": ", a full
  // stop) are lines (common.join.*), since a language may join differently.
  // The style page (/style, staging only) is a sample book, not the app, so
  // its sample text stays written in.
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/__tests__/**', 'src/components/style-page/**'],
    plugins: { formatjs: formatjs.default ?? formatjs },
    rules: {
      'formatjs/no-literal-string-in-jsx': 'error',
    },
  },
]);
