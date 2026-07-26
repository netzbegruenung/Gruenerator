/**
 * Component/hook lane. Runs alongside the Vitest node lane (`*.vitest.ts`) —
 * the two globs never overlap, so neither runner picks up the other's files.
 *
 * React Native components need the real RN runtime and its Flow-typed source
 * transformed through Babel, which is what jest-expo's preset provides. Vitest
 * cannot do that, hence the second runner.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/', '/maestro/'],

  // Collapse react/react-dom onto the single Expo-pinned copy in
  // apps/mobile/node_modules. Three copies exist on disk under
  // node-linker=hoisted — the root one, the Expo-pinned one here, and a nested
  // one inside @testing-library/react-native — and two React instances do not
  // share a hook dispatcher. The symptom is not an error: `renderHook` returns
  // an undefined `result.current`. Mirrors the dedupe metro.config.js applies
  // to the real bundle.
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
  },

  // NOTE: transformIgnorePatterns is deliberately NOT set. jest-expo's preset
  // already ships a correct one — it allowlists every expo-*/react-native-*
  // package AND excludes react-native-reanimated/plugin and
  // @react-native/babel-preset, which must not be transformed (reentrant-plugin
  // crash). Overriding it with a hand-rolled pattern silently drops those
  // exclusions and breaks on the first expo-modules-core import. Workspace
  // packages resolve through symlinks to packages/*/src, outside node_modules,
  // so they are transformed without needing an entry.
  //
  // @gruenerator/* expose their TS sources under the "development" export
  // condition; jest-expo only sets ['react-native'] by default, which would
  // resolve them to an unbuilt dist/.
  testEnvironmentOptions: { customExportConditions: ['development', 'react-native'] },
};
