import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// expo-router parses the query of every incoming deep link
// (getStateFromPath -> parseQueryParams). Up to SDK 57 that went through
// query-string@7 and decode-uri-component@0.2.2, which decodes malformed
// percent-encoded input superlinearly (GHSA-vcc3-ghjq-m6fr): seconds on the JS
// thread for a 1.8 KB query, triggered by any link handed to a user. We carried
// a pnpm patch for it. From expo-router 58.0.14 on, parseQueryParams uses
// `new URL(...).searchParams` and query-string is gone from the tree, so the
// patch was dropped.
//
// This test runs the real installed parseQueryParams with the old payload, so a
// router version that goes back to a superlinear decoder fails here. It runs on
// Node's URL; the app runs Expo's URL polyfill on Hermes, which this does not
// cover.
const requireHere = createRequire(import.meta.url);
const requireFromRouter = createRequire(requireHere.resolve('expo-router/package.json'));
const { parseQueryParams } = requireFromRouter('./build/fork/getStateFromPath-forks.js') as {
  parseQueryParams: (
    path: string,
    route: { name: string; params?: Record<string, unknown> }
  ) => Record<string, unknown> | undefined;
};

describe('deep-link query parsing', () => {
  it('no longer pulls in query-string', () => {
    expect(() => requireFromRouter.resolve('query-string')).toThrow();
  });

  it('decodes malformed percent-encoding in linear time', () => {
    const hostile = `/chat?q=${'%A0'.repeat(600)}`;

    const started = performance.now();
    parseQueryParams(hostile, { name: 'chat' });
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(500);
  });

  it('decodes well-formed queries unchanged', () => {
    expect(parseQueryParams('/chat?name=st%C3%A5le&note=a+b&sign=a%2Bb', { name: 'chat' })).toEqual(
      {
        name: 'ståle',
        note: 'a b',
        sign: 'a+b',
      }
    );
  });
});
