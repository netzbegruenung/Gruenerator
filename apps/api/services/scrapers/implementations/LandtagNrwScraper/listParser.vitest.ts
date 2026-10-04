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

  it('reads the total from the pagination counter', () => {
    expect(page.total).toBe(21910);
  });

  it('parses every result', () => {
    expect(page.entries).toHaveLength(7);
  });

  it('reads an Antwort completely', () => {
    const antwort = page.entries.find((e) => e.documentNumber === '18/21508');
    expect(antwort).toMatchObject({
      recordId: '1815173/0200',
      title:
        'Ermüdungsschäden bei Stadtbahnen: Welche Bautypen sind betroffen und wo sind sie in NRW im Einsatz?',
      descriptor: 'Antwort MUNV zu KlAnfr 6961 Drs 18/20669',
      documentKind: 'Drucksache',
      publishedAt: '2026-09-28',
      pdfUrl: 'https://www.landtag.nrw.de/portal/WWW/dokumentenarchiv/Dokument/MMD18-21508.pdf',
      pageRanges: [{ from: 1, to: 0 }],
      abstract: null,
      systematik: ['Verkehr'],
      schlagworte: expect.arrayContaining(['Stadtbahn', 'Wartung']) as unknown,
      redner: [],
    });
  });

  it('keeps the authors line of a multi-line descriptor on one line', () => {
    const aenderung = page.entries.find((e) => e.descriptor.startsWith('Änderungsantrag'));
    expect(aenderung?.descriptor).toMatch(
      /^Änderungsantrag CDU, GRÜNE zu GesEntw LRg Drs 18\/20443 Schick/
    );
    expect(aenderung?.descriptor).not.toContain('\n');
  });
});

describe('parseListPage — Anträge', () => {
  it('reads the abstract that precedes the Systematik', () => {
    const [antrag] = parseListPage(fixture('antraege.html')).entries;
    expect(antrag.abstract).toMatch(/^Vor dem Hintergrund der Ergebnisse des Bildungsmonitors/);
    expect(antrag.systematik).toEqual(['Schulen', 'Bildung']);
    expect(antrag.trailer).toMatch(/^Neudruck 14\.09\.2026/);
    expect(antrag.publishedAt).toBe('2026-09-14');
  });
});

describe('parseListPage — Plenarprotokolle', () => {
  const [top] = parseListPage(fixture('plenarprotokolle.html')).entries;

  it('links the page extract of the agenda item, not the whole protocol', () => {
    expect(top.pdfUrl).toContain('Dokument?Id=MMP18%2F131|30|38');
    expect(top.pageRanges).toEqual([{ from: 30, to: 38 }]);
    expect(top.documentKind).toBe('Plenarprotokoll');
    expect(top.documentNumber).toBe('18/131');
  });

  it('reads the Beschluss with the vote and every speaker', () => {
    expect(top.beschluss).toMatch(/mit den Stimmen der Fraktionen von CDU, SPD, GRÜNEN und FDP/);
    expect(top.systematik).toEqual(['Kernenergie']);
    expect(top.redner).toHaveLength(10);
    expect(top.redner[2]).toBe('Röls, Michael GRÜNE S. 32');
  });
});

describe('parseListPage — Ausschussprotokolle', () => {
  const [first, second] = parseListPage(fixture('ausschussprotokolle.html')).entries;

  it('reads every page range of a split agenda item', () => {
    expect(first.pageRanges).toEqual([
      { from: 1, to: 1 },
      { from: 4, to: 4 },
    ]);
    expect(second.pageRanges).toEqual([
      { from: 1, to: 2 },
      { from: 4, to: 15 },
    ]);
    expect(first.trailer).toBe('17.09.2026 92.AHeiKo S.1, 4');
  });

  it('keeps a multi-line abstract and a single speaker', () => {
    expect(second.abstract).toMatch(
      /^Auswärtige Sitzung auf der Landesgartenschau in Neuss; Fachgespräch mit/
    );
    expect(first.redner).toEqual(['Odermatt, Vanessa CDU']);
  });
});
