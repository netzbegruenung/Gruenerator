import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseListPage } from './listParser.js';

const fixture = (name: string): string =>
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', name),
    'utf8'
  );

describe('parseListPage — Drucksachen', () => {
  const page = parseListPage(fixture('drucksachen.html'));

  it('reads the total from the hit counter', () => {
    expect(page.total).toBe(21202);
  });

  it('parses every result', () => {
    expect(page.entries).toHaveLength(7);
  });

  it('reads an Antrag completely', () => {
    expect(page.entries[0]).toMatchObject({
      documentKind: 'Drucksache',
      documentNumber: '19/13869',
      publishedAt: '2026-10-07',
      descriptor: 'Antrag CSU, FREIE WÄHLER',
      title:
        'Mehr Wertschöpfung durch Veredelung von Produkten der Primärproduktion - Errichtung einer Produktions- und Forschungseinrichtung',
      abstract: expect.stringContaining('Prüfung und Bericht im zuständigen Ausschuss') as unknown,
      pdfUrl:
        'https://www.bayern.landtag.de/www/ElanTextAblage_WP19/Drucksachen/Basisdrucksachen/0000011500/0000011553.pdf',
      gegenstandId: '167665',
    });
    expect(page.entries[0].schlagworte).toHaveLength(16);
    expect(page.entries[0].schlagworte).toEqual(
      expect.arrayContaining(['Agrarprodukt', 'Landwirtschaft', 'Wertschöpfung'])
    );
  });

  it('keeps the abstract empty when the entry has none', () => {
    expect(page.entries[1]).toMatchObject({
      descriptor: 'Gesetzentwurf Staatsregierung',
      abstract: null,
    });
  });

  it('encodes spaces in PDF paths', () => {
    expect(page.entries[5].pdfUrl).toBe(
      'https://www.bayern.landtag.de/www/ElanTextAblage_WP19/Drucksachen/Schriftliche%20Anfragen/19_0013391.pdf'
    );
  });
});

describe('parseListPage — Plenarprotokolle', () => {
  const page = parseListPage(fixture('plenarprotokolle.html'));

  it('reads the session number and date', () => {
    expect(page.total).toBe(5807);
    expect(page.entries[0]).toMatchObject({
      documentKind: 'Plenarprotokoll',
      documentNumber: '19/87',
      publishedAt: '2026-07-23',
      descriptor: 'Beratungsphase zu Dringlichkeitsantrag FREIE WÄHLER, CSU DRS 19/12974',
    });
  });
});
