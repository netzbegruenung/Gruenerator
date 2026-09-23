import { describe, expect, it } from 'vitest';

import { isRefetchable, parseCliArgs, planDateRepair, planRepair } from './repair-lv-payload.js';

const BERLIN = { baseUrl: 'https://gruene.berlin' };

describe('parseCliArgs', () => {
  it('ist ohne --write ein Trockenlauf', () => {
    expect(parseCliArgs(['--titles', '--source', 'berlin-lv-presse'])).toEqual({
      args: {
        sources: ['berlin-lv-presse'],
        all: false,
        titles: true,
        overwriteDates: null,
        refetch: false,
        write: false,
        limit: null,
      },
    });
  });

  it('nimmt --source mehrfach und --limit als Zahl', () => {
    expect(
      parseCliArgs([
        '--titles',
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
        titles: true,
        overwriteDates: null,
        refetch: true,
        write: true,
        limit: 5,
      },
    });
  });

  it('verlangt --source oder --all, aber nicht beides', () => {
    expect(parseCliArgs(['--titles'])).toHaveProperty('error');
    expect(parseCliArgs(['--titles', '--all', '--source', 'x'])).toHaveProperty('error');
  });

  it('verweigert --refetch zusammen mit --all — das wäre ein Voll-Abruf aller Seiten', () => {
    expect(parseCliArgs(['--titles', '--all', '--refetch'])).toHaveProperty('error');
  });

  it('lehnt unbekannte Argumente ab', () => {
    expect(parseCliArgs(['--titles', '--source', 'x', '--force'])).toHaveProperty('error');
  });

  it('verlangt mindestens eine Regel — ohne gibt es keinen stillen Standard', () => {
    expect(parseCliArgs(['--source', 'x'])).toHaveProperty('error');
    expect(parseCliArgs(['--all', '--write'])).toHaveProperty('error');
  });

  it('nimmt --overwrite-dates mit einem bekannten Regelnamen', () => {
    expect(parseCliArgs(['--all', '--overwrite-dates', 'mid-june'])).toEqual({
      args: {
        sources: [],
        all: true,
        titles: false,
        overwriteDates: 'mid-june',
        refetch: false,
        write: false,
        limit: null,
      },
    });
  });

  it('lehnt fehlende und unbekannte Datumsregeln ab', () => {
    expect(parseCliArgs(['--all', '--overwrite-dates'])).toHaveProperty('error');
    expect(parseCliArgs(['--all', '--overwrite-dates', 'june'])).toHaveProperty('error');
  });

  it('verweigert --refetch ohne --titles — nur die Titelregel liest die Seite neu', () => {
    expect(
      parseCliArgs(['--source', 'x', '--overwrite-dates', 'mid-june', '--refetch'])
    ).toHaveProperty('error');
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

describe('planDateRepair — mid-june', () => {
  const pdf = (url: string, title: string, published_at: string | null) => ({
    source_url: url,
    title,
    published_at,
  });

  it('ersetzt die Jahresmitte-Schätzung, wenn der Titel ein volles Datum trägt', () => {
    expect(
      planDateRepair(
        pdf(
          'https://gruene.example/uploads/2023/LDK_Beschluss.pdf',
          'LDK 29.04.2023',
          '2023-06-15'
        ),
        'mid-june'
      )
    ).toEqual({ published_at: '2023-04-29' });
  });

  it('zählt als unresolved, wenn auch die Neuberechnung nur das Jahr kennt', () => {
    expect(
      planDateRepair(
        pdf('https://gruene.example/uploads/2023/Beschluss.pdf', 'Beschluss', '2023-06-15'),
        'mid-june'
      )
    ).toBe('unresolved');
  });

  it('zählt als unresolved statt null über ein Datum zu schreiben', () => {
    expect(
      planDateRepair(
        pdf('https://gruene.example/files/Beschluss.pdf', 'Beschluss', '2023-06-15'),
        'mid-june'
      )
    ).toBe('unresolved');
  });

  it('lässt Daten ohne den Defekt unangetastet', () => {
    expect(
      planDateRepair(
        pdf('https://gruene.example/files/LDK_2023-04-29.pdf', 'LDK', '2023-05-02'),
        'mid-june'
      )
    ).toBe('unchanged');
    expect(
      planDateRepair(pdf('https://gruene.example/files/a.pdf', 'LDK 29.04.2023', null), 'mid-june')
    ).toBe('unchanged');
  });

  it('fasst HTML-Seiten nicht an — dort ist der 15. Juni ein echtes Datum', () => {
    expect(
      planDateRepair(
        pdf('https://gruene.example/presse/sommerfest', 'Sommerfest 01.07.2023', '2023-06-15'),
        'mid-june'
      )
    ).toBe('unchanged');
  });
});
