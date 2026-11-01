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

// jest-expo's own transformIgnorePatterns with one more name in its allowlist:
// @ggraphic/* (#5212) ships ESM-only dist files and reaches every test through
// @gruenerator/contracts. The preset's two exclusions stay untouched. Throws if
// jest-expo changes the pattern's shape, rather than dropping the entry silently.
const ALLOWLIST_HEAD = '/node_modules/(?!(';
/** @type {{ transformIgnorePatterns: string[] }} */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a jest config is CommonJS
const jestExpoPreset = require('jest-expo/jest-preset');
const transformIgnorePatterns = jestExpoPreset.transformIgnorePatterns.map(
  (/** @type {string} */ pattern, /** @type {number} */ i) => {
    if (i > 0) return pattern;
    if (!pattern.startsWith(ALLOWLIST_HEAD)) {
      throw new Error(`jest-expo transformIgnorePatterns changed shape: ${pattern}`);
    }
    return pattern.replace(ALLOWLIST_HEAD, `${ALLOWLIST_HEAD}@ggraphic/|`);
  }
);

module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // Reanimated 4.7 ships a Jest resolver that swaps its native-only modules
  // (initializers, mappers, …) for their JS/web twins; without it
  // `react-native-reanimated/mock` initialises the native CSS bridge and dies
  // with "setCSSEventHandler is not available in JSReanimated".
  resolver: require.resolve('react-native-reanimated/jest/resolver'),
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

  // NOTE: transformIgnorePatterns is derived from jest-expo's preset, never
  // hand-rolled. The preset allowlists every expo-*/react-native-* package AND
  // excludes react-native-reanimated/plugin and @react-native/babel-preset,
  // which must not be transformed (reentrant-plugin crash). A hand-rolled
  // pattern silently drops those exclusions and breaks on the first
  // expo-modules-core import. Workspace packages resolve through symlinks to
  // packages/*/src, outside node_modules, so they need no entry.
  transformIgnorePatterns,
  //
  // @gruenerator/* expose their TS sources under the "development" export
  // condition; jest-expo only sets ['react-native'] by default, which would
  // resolve them to an unbuilt dist/.
  testEnvironmentOptions: { customExportConditions: ['development', 'react-native'] },
};
