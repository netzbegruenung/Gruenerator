import { describe, expect, it } from 'vitest';

import { assertSamePage, isRefetchable, parseCliArgs, planRepair } from './repair-lv-titles.js';

const BERLIN = { baseUrl: 'https://gruene.berlin' };

describe('parseCliArgs', () => {
  it('ist ohne --write ein Trockenlauf', () => {
    expect(parseCliArgs(['--source', 'berlin-lv-presse'])).toEqual({
      args: {
        sources: ['berlin-lv-presse'],
        all: false,
        refetch: false,
        write: false,
        limit: null,
      },
    });
  });

  it('nimmt --source mehrfach und --limit als Zahl', () => {
    expect(
      parseCliArgs([
        '--source',
        'berlin-lv-presse',
        '--source',
        'berlin-lv-beschluesse',
        '--refetch',
        '--limit',
        '5',
        '--write',
      ])
    ).toEqual({
      args: {
        sources: ['berlin-lv-presse', 'berlin-lv-beschluesse'],
        all: false,
        refetch: true,
        write: true,
        limit: 5,
      },
    });
  });

  it('verlangt --source oder --all, aber nicht beides', () => {
    expect(parseCliArgs([])).toHaveProperty('error');
    expect(parseCliArgs(['--all', '--source', 'x'])).toHaveProperty('error');
  });

  it('verweigert --refetch zusammen mit --all — das wäre ein Voll-Abruf aller Seiten', () => {
    expect(parseCliArgs(['--all', '--refetch'])).toHaveProperty('error');
  });

  it('lehnt unbekannte Argumente ab', () => {
    expect(parseCliArgs(['--source', 'x', '--force'])).toHaveProperty('error');
  });
});

describe('isRefetchable', () => {
  it('holt nur HTML-Seiten vom Host der Quelle', () => {
    expect(isRefetchable('https://gruene.berlin/beschluesse/x_3765', BERLIN)).toBe(true);
  });

  it('lässt Wolke-Dateien und PDFs aus', () => {
    expect(
      isRefetchable('https://wolke.netzbegruenung.de/s/xfFABYzM7pX83Fj#/WPS.pdf', BERLIN)
    ).toBe(false);
    expect(isRefetchable('https://gruene.berlin/fileadmin/a.pdf', BERLIN)).toBe(false);
  });
});

describe('planRepair', () => {
  const stored = {
    title: 'Unser Wahlprogramm - Kapitel 3: &nbsp;\nBerlin gestaltet Zukunft\nBerlin steht für...',
    published_at: '2026-03-27T15:20:03',
  };

  it('übernimmt den neu ausgelesenen Titel', () => {
    expect(
      planRepair(stored, { title: 'Unser Wahlprogramm - Kapitel 3', publishedAt: '2026-03-27' })
    ).toEqual({ title: 'Unser Wahlprogramm - Kapitel 3' });
  });

  it('überschreibt ein vorhandenes Datum nicht', () => {
    expect(planRepair(stored, { title: 'X', publishedAt: '2020-01-01' })).not.toHaveProperty(
      'published_at'
    );
  });

  it('trägt ein fehlendes Datum nach, wenn die Seite eines im ISO-Format liefert', () => {
    expect(
      planRepair({ title: 'X', published_at: null }, { title: 'X', publishedAt: '2026-05-06' })
    ).toEqual({ published_at: '2026-05-06' });
    expect(
      planRepair({ title: 'X', published_at: null }, { title: 'X', publishedAt: 'gestern' })
    ).toBeNull();
  });

  it('räumt ohne Abruf nur Leerraum und &nbsp; auf', () => {
    expect(planRepair({ title: 'Haltung ist hot ', published_at: null }, null)).toEqual({
      title: 'Haltung ist hot',
    });
  });

  it('fällt bei leerem Abruf-Titel auf die Normalisierung zurück', () => {
    expect(
      planRepair(
        { title: 'a&nbsp;b', published_at: '2026-01-01' },
        { title: '', publishedAt: null }
      )
    ).toEqual({ title: 'a b' });
  });

  it('gibt null zurück, wenn nichts zu tun ist', () => {
    expect(planRepair({ title: 'Sauber', published_at: '2026-01-01' }, null)).toBeNull();
  });
});

describe('assertSamePage', () => {
  const URL_ = 'https://gruene.berlin/pressemitteilungen/x_3856';
  const res = (
    over: Partial<{ ok: boolean; status: number; redirected: boolean; url: string }>
  ) => ({
    ok: true,
    status: 200,
    redirected: false,
    url: URL_,
    ...over,
  });

  it('akzeptiert die angefragte Seite, auch mit abweichendem Schlussstrich', () => {
    expect(() => assertSamePage(URL_, res({}))).not.toThrow();
    expect(() => assertSamePage(URL_, res({ url: `${URL_}/` }))).not.toThrow();
  });

  it('verwirft Nicht-OK-Antworten', () => {
    expect(() => assertSamePage(URL_, res({ ok: false, status: 404 }))).toThrow('HTTP 404');
  });

  it('verwirft eine Weiterleitung — sonst landete der Titel der Zielseite am Punkt', () => {
    expect(() =>
      assertSamePage(
        URL_,
        res({ redirected: true, url: 'https://gruene.berlin/pressemitteilungen' })
      )
    ).toThrow(/Weiterleitung/);
  });

  it('verwirft eine abweichende Ziel-URL auch ohne redirected-Flag', () => {
    expect(() => assertSamePage(URL_, res({ url: 'https://gruene.berlin/' }))).toThrow(
      /Weiterleitung/
    );
  });
});
