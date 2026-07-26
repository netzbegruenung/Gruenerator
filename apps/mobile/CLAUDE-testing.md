# Testing — apps/mobile

Two runners, split by what they need at runtime. The globs never overlap, so
neither picks up the other's files.

| Lane | Glob | Runner | Command |
| --- | --- | --- | --- |
| Logic | `*.vitest.ts` | Vitest, `environment: 'node'` | `pnpm --filter @gruenerator/mobile test` |
| Component / hook | `*.test.ts`, `*.test.tsx` | Jest + `jest-expo` | `pnpm --filter @gruenerator/mobile test:native` |

`pnpm test` at the repo root runs only the Vitest lane — see
[Why `test:native` is separate](#why-testnative-is-separate).

## Which lane?

**Default to the Vitest lane.** It is ~10× faster and needs no renderer. Stores,
utils, config derivation and pure service logic all belong there — most of
`stores/`, `utils/` and `config/` import nothing beyond `zustand` and
`@gruenerator/shared`.

**Use the Jest lane only when you need to render.** Anything importing React
Native components, or a hook that must actually mount, needs the real RN runtime
and its Flow-typed source transformed through Babel. Vitest cannot do that.

## Vitest lane

Config: [vitest.config.ts](vitest.config.ts). Two things in it are load-bearing:

- **`define: { __DEV__: 'false' }`** — Metro injects `__DEV__`; Node does not.
  Without it, importing anything that transitively reaches
  [services/devAuth.ts](services/devAuth.ts) dies with a `ReferenceError` at
  module scope. `false` mirrors a release bundle.
- **Stub aliases** — `react-native`, `@react-native-async-storage/async-storage`
  and `expo-secure-store` resolve to hand-written stubs in [test/stubs/](test/stubs/),
  not to `react-native-web`. Extend a stub when a test needs more surface; if you
  find yourself stubbing a renderer, the test belongs in the Jest lane.

Import test globals explicitly, as everywhere else in the repo:

```ts
import { describe, expect, it } from 'vitest';
```

Stubs are module singletons. Reset them in `beforeEach`:

```ts
import { __resetAsyncStorage } from '../test/stubs/async-storage';
import { __resetSecureStore, __setSecureStoreFailure } from '../test/stubs/expo-secure-store';
```

Zustand stores are singletons too — call the store's own `reset()`, or
`useSomeStore.setState({...})`, in `beforeEach`.

## Jest lane

Configs: [jest.config.js](jest.config.js), [babel.config.js](babel.config.js),
[test/jest.setup.ts](test/jest.setup.ts).

Four things that will cost you an afternoon if you change them without reading:

1. **Do not set `transformIgnorePatterns`.** jest-expo's preset already ships a
   correct one that allowlists every `expo-*` / `react-native-*` package *and*
   excludes `react-native-reanimated/plugin` and `@react-native/babel-preset`,
   which must not be transformed. Overriding it silently drops those exclusions
   and dies on the first `expo-modules-core` import.

2. **`moduleNameMapper` pins react to `apps/mobile/node_modules`.** Three React
   copies exist on disk under `node-linker=hoisted` — the root one, the
   Expo-pinned one here, and a nested one inside `@testing-library/react-native`.
   Two React instances do not share a hook dispatcher, and the symptom is not an
   error: `renderHook` returns an undefined `result.current`. Same dedupe
   [metro.config.js](metro.config.js) applies to the real bundle.

3. **`@testing-library/react-native` stays on v13.** v14 moved to the standalone
   `test-renderer` package and returns an empty object from `renderHook` under
   the RN environment. v13 uses `react-test-renderer`, which jest-expo already
   ships pinned to exactly the React version RN's bundled renderer requires.

4. **Import `jest` — do not use the global.** `@types/jest` declares
   `namespace jest` plus `describe`/`it`/`expect`, but no `jest` *value*, so the
   bare global fails typecheck:

   ```ts
   import { beforeEach, describe, expect, it, jest } from '@jest/globals';
   ```

   `babel-plugin-jest-hoist` understands this import and still hoists
   `jest.mock` above the module imports.

### Gotchas

- **`jest.resetAllMocks()`, not `clearAllMocks()`** in `beforeEach` if you use
  `mockResolvedValueOnce`. `clearAllMocks` does not drain the once-queue, so an
  outcome queued but never consumed leaks into the next test — and the failure
  shows up several tests later, nowhere near the cause.
- **Only wrap in `act()` what actually schedules React work.** A hook holding no
  state needs none; wrapping timer advancement in `act()` nests act scopes and
  breaks `result`.
- **Jest ≠ Vitest matchers.** `toHaveBeenCalledExactlyOnceWith` is Vitest-only;
  in the Jest lane use `toHaveBeenCalledTimes(1)` plus `toHaveBeenCalledWith(…)`.

## Why `test:native` is separate

The root `test` script stays `vitest run` so a flaky component lane cannot block
the repo-wide, merge-blocking `Tests` job. Once the Jest lane has been stable for
a few weeks, fold it in: `"test": "vitest run && jest"`.

## Adding a dependency

`jest-expo` is pinned to the Expo SDK version and moves only via
`npx expo install` during an SDK upgrade — same rule as `react`/`react-dom`,
which `apps/mobile` pins to the exact version the SDK ships (see the
`/apps/mobile` block in [.github/dependabot.yml](../../.github/dependabot.yml)).

## What is deliberately not tested here

Registry-drift across the per-notebook maps (`NOTEBOOK_IONICONS`,
`NOTEBOOK_RESEARCH_COLLECTIONS`, `ICON_MAP`) is already caught at compile time by
`satisfies Record<NotebookId, …>`. Do not add parity tests for those — they would
duplicate the typechecker. Test the *derivation* on top instead: the dev/disabled
filter, the AT/DE audience split, the id→config fallbacks.
