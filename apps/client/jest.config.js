// jest-expo, plus one mapping, one folder left out, and marked transformed. lucide-react-native's React Native entry is an
// ES module (.mjs), which Jest can't load, so tests use its CommonJS build.
// Metro, which builds the app itself, is unaffected. jest.setup.js stands in
// for the safe area.
// marked (Ask Jonz's Markdown, in @app/core) and FormatJS (the app's words) ship only as ES modules, so they're transformed like Expo's own.
const preset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: preset.transformIgnorePatterns.map((p, i) => (i === 0 ? p.replace('standard-navigation', 'standard-navigation|marked|@formatjs|intl-messageformat') : p)),
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The lint rules' tests run under node's own runner (see package.json):
  // Expo's preset can't host ESLint.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/eslint-rules/'],
  moduleNameMapper: {
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
};
