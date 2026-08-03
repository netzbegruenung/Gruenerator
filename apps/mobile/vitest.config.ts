import path from 'node:path';

import { defineConfig } from 'vitest/config';

const stub = (name: string): string => path.resolve(import.meta.dirname, `./test/stubs/${name}.ts`);

export default defineConfig({
  // Metro injects `__DEV__`; Node does not. Without this, importing anything
  // that transitively reaches `services/devAuth.ts` dies with a ReferenceError
  // at module scope. `false` mirrors a release bundle — the safe default, and
  // the value the dev-bypass backstop is supposed to see in production.
  define: { __DEV__: 'false' },
  resolve: {
    // Resolve workspace packages (@gruenerator/*) to their TS sources.
    conditions: ['development'],
    alias: {
      // This lane is Node-only: it covers the ~2.5k LOC of stores, utils, config
      // and service logic that never touch a native module. The few RN/Expo
      // imports those files still carry are aliased to hand-written stubs rather
      // than pulling in react-native-web — anything that genuinely needs a
      // renderer belongs in the jest-expo lane (*.test.tsx), not here.
      'react-native': stub('react-native'),
      '@react-native-async-storage/async-storage': stub('async-storage'),
      'expo-secure-store': stub('expo-secure-store'),
    },
  },
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
});
