import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSharepicVorlage,
  listSharepicVorlagen,
  resetSharepicVorlagenCache,
  sharepicVorlageThumbFile,
} from './catalog.js';

let root = '';
vi.mock('../skills/internalPrompts.js', () => ({ internContentRoot: () => root }));

const entry = (id: string, locale: 'de-DE' | 'de-AT', color: string) => ({
  id,
  titel: `Titel ${id}`,
  beschreibung: 'Kurz beschrieben.',
  form: 'einzelbild',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Sharepic zum Radverkehr'] },
  spec: {
    locale,
    slides: [
      {
        background: { kind: 'farbe', color },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'headline', lines: ['Mehr Platz', 'fürs Rad'] }],
        logo: true,
      },
    ],
  },
});

function writeCatalog(files: Record<string, unknown>) {
  root = mkdtempSync(path.join(tmpdir(), 'intern-'));
  mkdirSync(path.join(root, 'sharepic-vorlagen'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, 'sharepic-vorlagen', name), JSON.stringify(content));
  }
}

beforeEach(() => resetSharepicVorlagenCache());
afterEach(() => vi.useRealTimers());

describe('sharepic Vorlagen catalogue', () => {
  it('keeps the countries apart', () => {
    writeCatalog({
      'de.json': [entry('de-rad', 'de-DE', 'tanne')],
      'at.json': [entry('at-rad', 'de-AT', 'dunkelgruen')],
    });
    expect(listSharepicVorlagen('de-DE').map((v) => v.id)).toEqual(['de-rad']);
    expect(listSharepicVorlagen('de-AT').map((v) => v.id)).toEqual(['at-rad']);
    expect(listSharepicVorlagen(null)).toHaveLength(2);
    expect(getSharepicVorlage('at-rad')).toMatchObject({ locale: 'de-AT', attributions: [null] });
  });

  it('skips an entry filed under the wrong country, an invalid one and a duplicate', () => {
    writeCatalog({
      'de.json': [
        entry('de-rad', 'de-DE', 'tanne'),
        entry('falsch', 'de-AT', 'dunkelgruen'),
        { id: 'kaputt' },
        entry('de-rad', 'de-DE', 'mint'),
      ],
    });
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual(['de-rad']);
  });

  it('is empty without the private checkout', () => {
    root = path.join(tmpdir(), 'no-intern-here');
    expect(listSharepicVorlagen(null)).toEqual([]);
    expect(sharepicVorlageThumbFile('de-rad')).toBeNull();
  });

  it('resolves thumbnails only for known ids and existing slides', () => {
    const carousel = entry('de-rad', 'de-DE', 'tanne');
    carousel.spec.slides = [
      carousel.spec.slides[0]!,
      carousel.spec.slides[0]!,
      carousel.spec.slides[0]!,
    ];
    writeCatalog({ 'de.json': [carousel] });
    const thumbs = path.join(root, 'sharepic-vorlagen/thumbs');
    expect(sharepicVorlageThumbFile('de-rad')).toBe(path.join(thumbs, 'de-rad.webp'));
    expect(sharepicVorlageThumbFile('de-rad', 3)).toBe(path.join(thumbs, 'de-rad-3.webp'));
    expect(sharepicVorlageThumbFile('de-rad', 4)).toBeNull();
    expect(sharepicVorlageThumbFile('de-rad', 0)).toBeNull();
    expect(sharepicVorlageThumbFile('de-rad', Number.NaN)).toBeNull();
    expect(sharepicVorlageThumbFile('../../etc/passwd')).toBeNull();
  });

  it('hashes the thumbnails into thumbVersion and changes it with the image', () => {
    writeCatalog({
      'de.json': [entry('de-rad', 'de-DE', 'tanne'), entry('de-ohne', 'de-DE', 'mint')],
    });
    const thumbs = path.join(root, 'sharepic-vorlagen/thumbs');
    mkdirSync(thumbs);
    writeFileSync(path.join(thumbs, 'de-rad.webp'), 'bild-eins');
    const first = getSharepicVorlage('de-rad')?.thumbVersion;
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(getSharepicVorlage('de-ohne')?.thumbVersion).toBeUndefined();

    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000);
    writeFileSync(path.join(thumbs, 'de-rad.webp'), 'bild-zwei');
    expect(getSharepicVorlage('de-rad')?.thumbVersion).toMatch(/^[0-9a-f]{12}$/);
    expect(getSharepicVorlage('de-rad')?.thumbVersion).not.toBe(first);
  });

  it('reloads after the content changed, but checks at most every 30 seconds', () => {
    vi.useFakeTimers();
    writeCatalog({ 'de.json': [entry('de-rad', 'de-DE', 'tanne')] });
    const catalogFile = path.join(root, 'sharepic-vorlagen/de.json');
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual(['de-rad']);

    writeFileSync(catalogFile, JSON.stringify([entry('de-neu', 'de-DE', 'tanne')]));
    const later = new Date(Date.now() + 5_000);
    utimesSync(catalogFile, later, later);
    vi.advanceTimersByTime(10_000);
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual(['de-rad']);

    vi.advanceTimersByTime(25_000);
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual(['de-neu']);
  });

  it('keeps the cache while nothing changed', () => {
    vi.useFakeTimers();
    writeCatalog({ 'de.json': [entry('de-rad', 'de-DE', 'tanne')] });
    const first = listSharepicVorlagen(null);
    vi.advanceTimersByTime(60_000);
    expect(listSharepicVorlagen(null)).toBe(first);
  });
});
