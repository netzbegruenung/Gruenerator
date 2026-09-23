import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { redactShareTokens, resolveWolkeShareLink } from './wolkeShareSecrets.js';

describe('resolveWolkeShareLink', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolke-shares-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns the link stored under the key', () => {
    writeFileSync(
      join(root, 'wolke-shares.json'),
      JSON.stringify({ 'berlin-wahlpruefsteine': 'https://wolke.netzbegruenung.de/s/TESTTOKEN' })
    );
    expect(resolveWolkeShareLink('berlin-wahlpruefsteine', root)).toBe(
      'https://wolke.netzbegruenung.de/s/TESTTOKEN'
    );
  });

  it('returns null for an unknown key, an empty link, a missing or a broken file', () => {
    expect(resolveWolkeShareLink('berlin-wahlpruefsteine', root)).toBeNull();

    writeFileSync(join(root, 'wolke-shares.json'), JSON.stringify({ other: '', empty: '' }));
    expect(resolveWolkeShareLink('berlin-wahlpruefsteine', root)).toBeNull();
    expect(resolveWolkeShareLink('empty', root)).toBeNull();

    writeFileSync(join(root, 'wolke-shares.json'), '{not json');
    expect(resolveWolkeShareLink('other', root)).toBeNull();
  });
});

describe('redactShareTokens', () => {
  it('masks the token and keeps the file path', () => {
    expect(
      redactShareTokens('Wolke https://wolke.netzbegruenung.de/s/TESTTOKEN#/a b.pdf: 400')
    ).toBe('Wolke https://wolke.netzbegruenung.de/s/<redacted>#/a b.pdf: 400');
  });

  it('masks the index.php form and every occurrence', () => {
    expect(
      redactShareTokens(
        'wolke.netzbegruenung.de/index.php/s/TESTTOKEN and wolke.netzbegruenung.de/s/OTHERTOKEN'
      )
    ).toBe(
      'wolke.netzbegruenung.de/index.php/s/<redacted> and wolke.netzbegruenung.de/s/<redacted>'
    );
  });

  it('leaves other URLs alone', () => {
    const text = 'https://gruene.berlin/s/abcdef123456789 timed out';
    expect(redactShareTokens(text)).toBe(text);
  });
});
