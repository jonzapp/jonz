// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

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
      'jonz/no-pressable-in-screens': 'error',
      'jonz/owner-only': 'error',
    },
  },
]);
