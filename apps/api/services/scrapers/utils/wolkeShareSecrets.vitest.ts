import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildWolkeFileUrl,
  redactShareTokens,
  resolveWolkeDisplayUrl,
  resolveWolkeShareLink,
  toStoredWolkeUrl,
} from './wolkeShareSecrets.js';

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

describe('wolke:// source urls', () => {
  const LINK = 'https://wolke.netzbegruenung.de/s/TESTTOKEN';
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wolke-shares-'));
    writeFileSync(join(root, 'wolke-shares.json'), JSON.stringify({ 'berlin-wps': LINK }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('builds a token-free url from the key and the raw relative path', () => {
    expect(buildWolkeFileUrl('berlin-wps', 'WPS 2026/Grüne Antwort (ADFC).pdf')).toBe(
      'wolke://berlin-wps/WPS 2026/Grüne Antwort (ADFC).pdf'
    );
  });

  it('resolves to the share link with the path after #/', () => {
    expect(resolveWolkeDisplayUrl('wolke://berlin-wps/Ordner/Datei ä.pdf', root)).toBe(
      `${LINK}#/Ordner/Datei ä.pdf`
    );
  });

  it('round-trips with the builder, nested and with umlauts and spaces', () => {
    const rel = 'WPS 2026/Unterordner/Grüne Antwort – Wärme #2.pdf';
    const stored = buildWolkeFileUrl('berlin-wps', rel);
    const shown = resolveWolkeDisplayUrl(stored, root);
    expect(shown).toBe(`${LINK}#/${rel}`);
    expect(toStoredWolkeUrl(shown, root)).toBe(stored);
  });

  it('passes other urls through unchanged', () => {
    expect(resolveWolkeDisplayUrl('https://gruene.berlin/a', root)).toBe('https://gruene.berlin/a');
    expect(resolveWolkeDisplayUrl('', root)).toBe('');
  });

  it('leaves a url with an unknown key or a missing file unchanged', () => {
    expect(resolveWolkeDisplayUrl('wolke://gone/a.pdf', root)).toBe('wolke://gone/a.pdf');
    rmSync(join(root, 'wolke-shares.json'));
    expect(resolveWolkeDisplayUrl('wolke://berlin-wps/a.pdf', root)).toBe(
      'wolke://berlin-wps/a.pdf'
    );
  });

  it('maps a resolved link back to its stored form, and nothing else', () => {
    expect(toStoredWolkeUrl(`${LINK}#/a.pdf`, root)).toBe('wolke://berlin-wps/a.pdf');
    expect(toStoredWolkeUrl('wolke://berlin-wps/a.pdf', root)).toBe('wolke://berlin-wps/a.pdf');
    expect(toStoredWolkeUrl('https://wolke.netzbegruenung.de/s/OTHER#/a.pdf', root)).toBe(
      'https://wolke.netzbegruenung.de/s/OTHER#/a.pdf'
    );
    expect(toStoredWolkeUrl('https://gruene.berlin/a', root)).toBe('https://gruene.berlin/a');
  });
});
