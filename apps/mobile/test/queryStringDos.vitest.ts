import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// expo-router parses the query of every incoming deep link with query-string
// (getStateFromPath -> parseQueryParams -> queryString.parse), and query-string
// hands each key and value to decode-uri-component. That module's 0.2.2 release
// decodes malformed percent-encoded input superlinearly (GHSA-vcc3-ghjq-m6fr):
// unpatched, the payload below takes seconds and a slightly longer one takes
// minutes, on the JS thread, triggered by any link handed to a user.
//
// 0.2.2 is the only version query-string@7 accepts and the patched line (>=0.5.0)
// is ESM-only, so the fix is a pnpm patch (patches/decode-uri-component@0.2.2.patch).
// This test runs the real installed copy, resolved exactly the way expo-router
// resolves it, and fails both ways the fix can break: a dropped patch makes it
// time out, and an ESM decode-uri-component makes queryString.parse throw
// "decodeComponent is not a function".
const requireHere = createRequire(import.meta.url);
const requireFromRouter = createRequire(requireHere.resolve('expo-router/package.json'));
const queryString = requireFromRouter('query-string') as {
  parse: (input: string) => Record<string, unknown>;
};

describe('deep-link query parsing', () => {
  it('decodes malformed percent-encoding in linear time', () => {
    const hostile = `q=${'%A0'.repeat(600)}`;

    const started = performance.now();
    queryString.parse(hostile);
    const elapsed = performance.now() - started;

    // Patched: well under a millisecond. Unpatched: seconds for this length.
    expect(elapsed).toBeLessThan(500);
  });

  it('decodes well-formed queries unchanged', () => {
    expect(queryString.parse('name=st%C3%A5le&note=a+b&sign=a%2Bb')).toEqual({
      name: 'ståle',
      note: 'a b',
      sign: 'a+b',
    });
  });
});
