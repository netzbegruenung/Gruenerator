import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

// expo-router parses the query of every incoming deep link with query-string
// (getStateFromPath -> parseQueryParams -> queryString.parse), and query-string
// hands each key and value to decode-uri-component. That module's 0.2.2 release
// decodes malformed percent-encoded input superlinearly (GHSA-vcc3-ghjq-m6fr,
// GHSA-qr28-fpjm-wq7f): unpatched, the payloads below take seconds and slightly
// longer ones take minutes, on the JS thread, triggered by any link handed to a
// user.
//
// 0.2.2 is the only version query-string@7 accepts and the patched line (>=0.5.1)
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

  // GHSA-qr28-fpjm-wq7f: after the decode() rewrite above, the fallback still ran
  // one full-string `replace(new RegExp(run, 'g'))` per distinct percent-encoded
  // run, so K distinct runs cost O(K·L). Payload shape from the advisory; at
  // 16 000 runs (~112 KB) the replace loop takes ~5 s, the single pass ~20 ms.
  it('decodes many distinct percent-encoded runs in linear time', () => {
    let hostile = 'q=';
    for (let i = 0; i < 16_000; i++) {
      const high = Math.floor(i / 256)
        .toString(16)
        .padStart(2, '0');
      const low = (i % 256).toString(16).padStart(2, '0');
      hostile += `%${high}%${low}x`;
    }
    hostile += '%zz';

    const started = performance.now();
    queryString.parse(hostile);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(500);
  });

  it('decodes each run once, never the decoded output again', () => {
    expect(queryString.parse('a=%25C2%zz&b=%41%FE%FF&c=%25%41%zz')).toEqual({
      a: '%C2%zz',
      b: 'A��',
      c: '%A%zz',
    });
  });

  it('decodes well-formed queries unchanged', () => {
    expect(queryString.parse('name=st%C3%A5le&note=a+b&sign=a%2Bb')).toEqual({
      name: 'ståle',
      note: 'a b',
      sign: 'a+b',
    });
  });
});
