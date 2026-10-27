/**
 * Component/hook lane. Runs alongside the Vitest node lane (`*.vitest.ts`) —
 * the two globs never overlap, so neither runner picks up the other's files.
 *
 * React Native components need the real RN runtime and its Flow-typed source
 * transformed through Babel, which is what jest-expo's preset provides. Vitest
 * cannot do that, hence the second runner.
 */
// Wherever the hoisted linker put mobile's react — nested under apps/mobile
// while web pins another version, at the root when they agree.
const dirOf = (pkg) =>
  require.resolve(`${pkg}/package.json`, { paths: [__dirname] }).replace(/[\\/]package\.json$/, '');
const reactDir = dirOf('react');
const reactDomDir = dirOf('react-dom');

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/', '/maestro/'],

  // Collapse react/react-dom onto the single Expo-pinned copy mobile resolves.
  // Under node-linker=hoisted several copies can exist on disk — the root one,
  // an Expo-pinned one in apps/mobile/node_modules, and a nested one inside
  // @testing-library/react-native — and two React instances do not
  // share a hook dispatcher. The symptom is not an error: `renderHook` returns
  // an undefined `result.current`. Mirrors the dedupe metro.config.js applies
  // to the real bundle.
  moduleNameMapper: {
    '^react$': reactDir,
    '^react/(.*)$': `${reactDir}/$1`,
    '^react-dom$': reactDomDir,
    '^react-dom/(.*)$': `${reactDomDir}/$1`,

    // The TS sources in packages/* use ESM-style relative specifiers
    // (`export * from './client.js'`) that actually point at `./client.ts`.
    // Metro and tsc follow that convention; jest-resolve takes the extension
    // literally and dies with "Cannot find module './client.js'" on the first
    // import that reaches @gruenerator/shared — which is every import of
    // @gruenerator/chat, since chatStore pulls in shared/api.
    //
    // Dropping the extension lets the normal resolver find either .ts or .js,
    // so real JavaScript files (inside node_modules) still resolve unchanged.
    // Without this, a test can only reach the chat stores by mocking the whole
    // package, which is the opposite of what a store test is for.
    '^(\\.{1,2}/.*)\\.js$': '$1',

    // nanoid 6 is ESM-only and jest-expo's transformIgnorePatterns does not
    // allowlist it — and that pattern must not be overridden (see
    // CLAUDE-testing.md). `@gruenerator/shared/utils` pulls it in through
    // `slug.ts`, so without this every test touching the chat tree dies on
    // "Cannot use import statement outside a module".
    // expo-router's own memory history and Stack client import
    // `nanoid/non-secure`, so the router tests in `test/navigation.test.tsx`
    // need the same stub.
    '^nanoid(/non-secure)?$': '<rootDir>/test/stubs/nanoid.ts',

    // AgentGlyph importiert einzelne Phosphor-Symbole über den Quelltext-Export
    // (`./src/icons/*`). Für Jest der fertige CommonJS-Build desselben Symbols —
    // der Quelltext bräuchte eine eigene Transform-Ausnahme.
    '^phosphor-react-native/src/icons/(.*)$':
      '<rootDir>/../../node_modules/phosphor-react-native/lib/commonjs/icons/$1',
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
