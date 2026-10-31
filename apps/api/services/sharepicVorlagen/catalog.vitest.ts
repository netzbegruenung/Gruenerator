import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canvasVorlageThumbFile,
  getCanvasVorlage,
  getPrintVorlage,
  getSharepicBlock,
  getSharepicSeite,
  getSharepicVorlage,
  defaultDeckStil,
  listCanvasVorlagen,
  listFolienVorlagen,
  listPrintVorlagen,
  listSharepicBloecke,
  listSharepicSeiten,
  listSharepicVorlagen,
  printVorlageThumbFile,
  resetSharepicVorlagenCache,
  sharepicBlockThumbFile,
  sharepicSeiteThumbFile,
  sharepicVorlageAssetFile,
  sharepicVorlageThumbFile,
} from './catalog.js';

const logs = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({ createLogger: () => logs }));

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
    mkdirSync(path.dirname(path.join(root, 'sharepic-vorlagen', name)), { recursive: true });
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

const seite = (id: string, color: string, formats = ['post-portrait']) => ({
  id,
  titel: `Seite ${id}`,
  rolle: 'inhalt',
  typ: 'text',
  formats,
  slide: {
    background: { kind: 'farbe', color },
    position: 'mitte',
    align: 'links',
    items: [{ type: 'absatz', text: 'Ein Absatz, der für sich steht.' }],
    logo: false,
  },
});

describe('sharepic Seiten catalogue', () => {
  it('keeps the countries apart and carries the file country', () => {
    writeCatalog({
      'seiten/de.json': [seite('de-text', 'tanne')],
      'seiten/at.json': [seite('at-text', 'dunkelgruen')],
    });
    expect(listSharepicSeiten('de-DE').map((s) => s.id)).toEqual(['de-text']);
    expect(listSharepicSeiten(null)).toHaveLength(2);
    expect(getSharepicSeite('at-text')).toMatchObject({ locale: 'de-AT', attribution: null });
  });

  it('skips an invalid entry, a slide the country cannot show and a duplicate', () => {
    writeCatalog({
      'seiten/de.json': [
        seite('de-text', 'tanne'),
        { id: 'kaputt' },
        seite('doppelt-format', 'tanne', ['post-portrait', 'post-portrait']),
        seite('de-text', 'mint'),
      ],
      // Tanne is a DE colour.
      'seiten/at.json': [seite('at-falsch', 'tanne')],
    });
    expect(listSharepicSeiten(null).map((s) => s.id)).toEqual(['de-text']);
  });

  it('offers each Vorlage slide as a Seite in the Vorlage format, without the carousel teaser', () => {
    const base = entry('de-karussell', 'de-DE', 'tanne');
    const slide = base.spec.slides[0]!;
    const karussell = {
      ...base,
      spec: {
        ...base.spec,
        format: 'post-portrait-tall',
        slides: [
          { ...slide, weiter: 'Denn' },
          { ...slide, items: [{ type: 'zitat', text: 'Ein Satz.', name: 'Jemand' }] },
          { ...slide, items: [{ type: 'aufruf', stil: 'ausruf', text: 'Mach mit' }] },
        ],
      },
    };
    writeCatalog({ 'de.json': [karussell, entry('de-rad', 'de-DE', 'tanne')] });

    const seiten = listSharepicSeiten('de-DE');
    expect(seiten.map((s) => [s.id, s.rolle, s.typ, s.formats])).toEqual([
      ['de-karussell-s1', 'titel', 'text', ['post-portrait-tall']],
      ['de-karussell-s2', 'inhalt', 'zitat', ['post-portrait-tall']],
      ['de-karussell-s3', 'schluss', 'aufruf', ['post-portrait-tall']],
      ['de-rad-s1', 'titel', 'text', ['post-portrait']],
    ]);
    expect(seiten[0]).toMatchObject({
      titel: 'Titel de-karussell',
      quelle: { vorlage: 'de-karussell', seite: 1 },
      locale: 'de-DE',
      attribution: null,
    });
    expect(seiten[0]!.slide).not.toHaveProperty('weiter');
    expect(listSharepicVorlagen(null)).toHaveLength(2);
  });

  it('gives a GJ Vorlage GJ Seiten, listed only when asked for that design', () => {
    const gj = entry('gj-de-statement', 'de-DE', 'wiese');
    writeCatalog({
      'de.json': [entry('de-rad', 'de-DE', 'tanne')],
      'gj-de.json': [{ ...gj, spec: { ...gj.spec, brand: 'gruene-jugend' } }],
    });

    expect(listSharepicSeiten('de-DE', 'gruene').map((s) => s.id)).toEqual(['de-rad-s1']);
    const seiten = listSharepicSeiten('de-DE', 'gruene-jugend');
    expect(seiten.map((s) => [s.id, s.brand])).toEqual([['gj-de-statement-s1', 'gruene-jugend']]);
    expect(listSharepicSeiten('de-AT', 'gruene-jugend')).toEqual([]);
  });

  it('leaves out a Vorlage slide a curated Seite was taken from', () => {
    writeCatalog({
      'de.json': [entry('de-rad', 'de-DE', 'tanne')],
      'seiten/de.json': [{ ...seite('de-text', 'tanne'), quelle: { vorlage: 'de-rad', seite: 1 } }],
    });
    expect(listSharepicSeiten(null).map((s) => s.id)).toEqual(['de-text']);
  });

  it('previews a Vorlage slide Seite with the Vorlage slide thumbnail', () => {
    const base = entry('de-rad', 'de-DE', 'tanne');
    writeCatalog({
      'de.json': [
        { ...base, spec: { ...base.spec, slides: [base.spec.slides[0]!, base.spec.slides[0]!] } },
      ],
    });
    const thumbs = path.join(root, 'sharepic-vorlagen/thumbs');
    expect(sharepicSeiteThumbFile('de-rad-s1', 'post-portrait')).toBe(
      path.join(thumbs, 'de-rad.webp')
    );
    expect(sharepicSeiteThumbFile('de-rad-s2', 'post-portrait')).toBe(
      path.join(thumbs, 'de-rad-2.webp')
    );
    expect(sharepicSeiteThumbFile('de-rad-s2', 'post-portrait-tall')).toBeNull();
  });

  it('skips a Vorlage slide whose Seite id would be too long', () => {
    const id = 'a'.repeat(63);
    writeCatalog({ 'de.json': [entry(id, 'de-DE', 'tanne')] });
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual([id]);
    expect(listSharepicSeiten(null)).toEqual([]);
  });

  it('resolves a preview only in the formats the Seite was checked in', () => {
    writeCatalog({ 'seiten/de.json': [seite('de-text', 'tanne')] });
    const thumbs = path.join(root, 'sharepic-vorlagen/thumbs/seiten');
    expect(sharepicSeiteThumbFile('de-text', 'post-portrait')).toBe(
      path.join(thumbs, 'de-text.post-portrait.webp')
    );
    expect(sharepicSeiteThumbFile('de-text', 'post-portrait-tall')).toBeNull();
    expect(sharepicSeiteThumbFile('de-text', '../x')).toBeNull();
    expect(sharepicSeiteThumbFile('unbekannt', 'post-portrait')).toBeNull();
  });

  it('hashes the previews into thumbVersion and reloads when one changes', () => {
    writeCatalog({ 'seiten/de.json': [seite('de-text', 'tanne')] });
    const thumbs = path.join(root, 'sharepic-vorlagen/thumbs/seiten');
    mkdirSync(thumbs, { recursive: true });
    writeFileSync(path.join(thumbs, 'de-text.post-portrait.webp'), 'bild-eins');
    const first = getSharepicSeite('de-text')?.thumbVersion;
    expect(first).toMatch(/^[0-9a-f]{12}$/);

    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000);
    writeFileSync(path.join(thumbs, 'de-text.post-portrait.webp'), 'bild-zwei');
    expect(getSharepicSeite('de-text')?.thumbVersion).not.toBe(first);
  });
});

const block = (id: string, color: string, text = 'Mehr ++Busse++ am Abend') => ({
  id,
  titel: `Block ${id}`,
  gruppe: 'listen',
  stichworte: ['Aufzählung'],
  color,
  items: [{ type: 'liste', stil: 'pfeile', items: [text, 'Radwege ausbauen'] }],
});

describe('sharepic Blöcke catalogue', () => {
  it('keeps the countries apart and carries the file country', () => {
    writeCatalog({
      'bloecke/de.json': [block('de-block-liste', 'mint')],
      'bloecke/at.json': [block('at-block-liste', 'dunkelgruen', 'Mehr ==Busse== am Abend')],
    });
    expect(listSharepicBloecke('de-DE').map((b) => b.id)).toEqual(['de-block-liste']);
    expect(listSharepicBloecke(null)).toHaveLength(2);
    expect(getSharepicBlock('at-block-liste')).toMatchObject({
      locale: 'de-AT',
      gruppe: 'listen',
      stichworte: ['Aufzählung'],
    });
  });

  it('skips an invalid entry, a colour the country cannot show and a duplicate', () => {
    writeCatalog({
      'bloecke/de.json': [
        block('de-block-liste', 'mint'),
        { id: 'kaputt' },
        block('de-block-liste', 'tanne'),
        // Dunkelgrün is an AT colour.
        block('de-block-falsch', 'dunkelgruen'),
      ],
    });
    expect(listSharepicBloecke(null).map((b) => b.id)).toEqual(['de-block-liste']);
  });

  it('resolves the preview of a known block only', () => {
    writeCatalog({ 'bloecke/de.json': [block('de-block-liste', 'mint')] });
    expect(sharepicBlockThumbFile('de-block-liste')).toBe(
      path.join(root, 'sharepic-vorlagen/thumbs/bloecke/de-block-liste.webp')
    );
    expect(sharepicBlockThumbFile('unbekannt')).toBeNull();
  });

  it('has no blocks when the folder is missing', () => {
    writeCatalog({ 'de.json': [entry('de-rad', 'de-DE', 'tanne')] });
    expect(listSharepicBloecke(null)).toEqual([]);
  });
});

const canvasEntry = (id: string, state: Record<string, unknown> = { text: 'Hallo' }) => ({
  id,
  titel: `Titel ${id}`,
  beschreibung: 'Ein Sticker.',
  format: 'profile-square',
  pages: [{ configId: 'sticker', state }],
});

describe('canvas Vorlagen catalogue', () => {
  it('keeps the countries apart and carries the file country', () => {
    writeCatalog({
      'de.json': [entry('de-rad', 'de-DE', 'tanne')],
      'canvas/de.json': [canvasEntry('sticker-danke')],
      'canvas/at.json': [canvasEntry('sticker-at')],
    });
    expect(listCanvasVorlagen('de-DE').map((v) => v.id)).toEqual(['sticker-danke']);
    expect(listCanvasVorlagen(null)).toHaveLength(2);
    expect(getCanvasVorlage('sticker-at')).toMatchObject({
      locale: 'de-AT',
      format: 'profile-square',
    });
    expect(listSharepicVorlagen(null).map((v) => v.id)).toEqual(['de-rad']);
  });

  it('skips an unknown format, a page with a blob: URL and a duplicate', () => {
    writeCatalog({
      'canvas/de.json': [
        canvasEntry('sticker-danke'),
        { ...canvasEntry('falsches-format'), format: 'banner-xxl' },
        canvasEntry('tab-bild', { image: { src: 'blob:http://localhost/1' } }),
        canvasEntry('sticker-danke'),
      ],
    });
    expect(listCanvasVorlagen(null).map((v) => v.id)).toEqual(['sticker-danke']);
  });

  it('resolves the preview for known ids and versions it by the image', () => {
    writeCatalog({ 'canvas/de.json': [canvasEntry('sticker-danke')] });
    expect(canvasVorlageThumbFile('unbekannt')).toBeNull();
    expect(getCanvasVorlage('sticker-danke')?.thumbVersion).toBeUndefined();

    mkdirSync(path.join(root, 'sharepic-vorlagen', 'thumbs', 'canvas'), { recursive: true });
    const thumb = path.join(root, 'sharepic-vorlagen', 'thumbs', 'canvas', 'sticker-danke.webp');
    writeFileSync(thumb, 'bild');
    resetSharepicVorlagenCache();
    expect(canvasVorlageThumbFile('sticker-danke')).toBe(thumb);
    expect(getCanvasVorlage('sticker-danke')?.thumbVersion).toEqual(expect.any(String));
  });
});

const printEntry = (
  id: string,
  locale: 'de-DE' | 'de-AT',
  impressum: Record<string, string> | null = null
) => ({
  id,
  titel: `Titel ${id}`,
  beschreibung: '',
  spec: impressum
    ? {
        locale,
        produkt: 'plakat',
        variante: 'typo',
        format: 'print-a3-hoch',
        impressum,
        slots: { headline: 'Hier steht deine Botschaft' },
      }
    : {
        locale,
        produkt: 'visitenkarte',
        variante: 'visitenkarte',
        format: 'print-visitenkarte-quer',
        impressum: null,
        slots: { name: 'Vorname Nachname' },
      },
});

describe('print Vorlagen catalogue', () => {
  const visdp = { art: 'visdp', name: 'Vorname Nachname', anschrift: 'Straße Nr., PLZ Ort' };

  it('keeps the countries apart and skips the wrong country and a filled-in impressum', () => {
    writeCatalog({
      'print/de.json': [
        printEntry('de-karte', 'de-DE'),
        printEntry('de-plakat', 'de-DE', visdp),
        printEntry('falsches-land', 'de-AT'),
        printEntry('echt', 'de-DE', { ...visdp, name: 'Anna Muster' }),
      ],
      'print/at.json': [printEntry('at-karte', 'de-AT')],
    });
    expect(listPrintVorlagen('de-DE').map((v) => v.id)).toEqual(['de-karte', 'de-plakat']);
    expect(getPrintVorlage('at-karte')).toMatchObject({ locale: 'de-AT' });
    expect(listPrintVorlagen(null)).toHaveLength(3);
  });

  it('resolves a preview per printed page: front and back of a card, the front of a poster', () => {
    writeCatalog({
      'print/de.json': [printEntry('de-karte', 'de-DE'), printEntry('de-plakat', 'de-DE', visdp)],
    });
    expect(printVorlageThumbFile('de-karte', 2)).toBe(
      path.join(root, 'sharepic-vorlagen', 'thumbs', 'print', 'de-karte-2.webp')
    );
    expect(printVorlageThumbFile('de-plakat', 2)).toBeNull();
    expect(printVorlageThumbFile('unbekannt')).toBeNull();

    mkdirSync(path.join(root, 'sharepic-vorlagen', 'thumbs', 'print'), { recursive: true });
    writeFileSync(path.join(root, 'sharepic-vorlagen', 'thumbs', 'print', 'de-karte.webp'), 'a');
    resetSharepicVorlagenCache();
    expect(getPrintVorlage('de-karte')?.thumbVersion).toEqual(expect.any(String));
  });
});

describe('Vorlage photos', () => {
  it('resolves a shipped file and nothing outside assets/', () => {
    writeCatalog({ 'de.json': [], 'assets/person.jpg': 'bild', 'geheim.jpg': 'nein' });
    expect(sharepicVorlageAssetFile('person.jpg')).toBe(
      path.join(root, 'sharepic-vorlagen', 'assets', 'person.jpg')
    );
    for (const name of [
      '../geheim.jpg',
      '..%2Fgeheim.jpg',
      'fehlt.jpg',
      'person.gif',
      'Person.jpg',
    ]) {
      expect(sharepicVorlageAssetFile(name)).toBeNull();
    }
  });
});

describe('Folien catalogue', () => {
  const folie = (id: string, stil: string, standard?: boolean) => ({
    id,
    titel: `Folie ${id}`,
    beschreibung: 'Kurz beschrieben.',
    stil,
    ...(standard ? { standard } : {}),
  });

  beforeEach(() => vi.clearAllMocks());

  it('loads folien per locale', () => {
    writeCatalog({
      'folien/de.json': [
        folie('de-folien-offiziell', 'cd', true),
        folie('de-folien-ruhig', 'ruhig'),
      ],
      'folien/at.json': [folie('at-folien-band', 'band', true)],
    });
    expect(listFolienVorlagen('de-DE').map((f) => f.id)).toEqual([
      'de-folien-offiziell',
      'de-folien-ruhig',
    ]);
    expect(listFolienVorlagen('de-AT')).toMatchObject([{ id: 'at-folien-band', locale: 'de-AT' }]);
    expect(defaultDeckStil('de-AT')).toBe('band');
    expect(defaultDeckStil('de-DE')).toBe('cd');
  });

  it('skips an entry with an unknown stil and logs it', () => {
    writeCatalog({
      'folien/de.json': [folie('de-folien-ruhig', 'ruhig'), folie('de-folien-neu', 'gibtsnicht')],
    });
    expect(listFolienVorlagen('de-DE').map((f) => f.id)).toEqual(['de-folien-ruhig']);
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('folien/de.json[1] skipped'));
  });

  it('falls back to the built-in cd entry without a catalogue', () => {
    writeCatalog({});
    expect(listFolienVorlagen('de-DE')).toMatchObject([{ stil: 'cd', standard: true }]);
    expect(listFolienVorlagen('de-AT')).toMatchObject([{ stil: 'cd', locale: 'de-AT' }]);
    expect(defaultDeckStil('de-DE')).toBe('cd');
  });

  it('two standard entries: first wins, logged', () => {
    writeCatalog({
      'folien/de.json': [
        folie('de-folien-ruhig', 'ruhig', true),
        folie('de-folien-band', 'band', true),
      ],
    });
    expect(defaultDeckStil('de-DE')).toBe('ruhig');
    expect(listFolienVorlagen('de-DE').filter((f) => f.standard)).toHaveLength(1);
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining('de-folien-band'));
  });
});
