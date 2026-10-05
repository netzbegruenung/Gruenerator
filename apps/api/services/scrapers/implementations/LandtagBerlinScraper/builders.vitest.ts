import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { splitPages } from '../../parliament/pageText.js';

import {
  ergebnisOf,
  filterFieldsOf,
  personName,
  speakersOf,
  ausschussSessionsOf,
  chooseTops,
  documentPayloadOf,
  drucksacheUnitsOf,
  entriesOfTop,
  fileKeyOf,
  headerTextOf,
  isPendingAnfrage,
  latestDateOf,
  plenarPagesOf,
  plenarUnitsOf,
  printedPageOffsetOf,
  printedPagesOf,
  splitTops,
  urheberOf,
} from './builders.js';
import { toEntry, type PardokRecord } from './pardokClient.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');
const raw = JSON.parse(read('entries.json')) as Record<string, PardokRecord[]>;
const entries = (key: string) => raw[key].map(toEntry);

describe('toEntry', () => {
  it('flattens a PARDOK record', () => {
    const [antrag] = entries('antrag');
    expect(antrag).toMatchObject({
      id: 'D-458706',
      documentNumber: '3519',
      docType: 'Antrag',
      sachgebiet: 'IT-Kriminalität',
      publishedAt: '2026-09-09',
      koerperschaften: ['Grüne', 'Die Linke'],
    });
    expect(antrag.pdfUrls[0].url).toMatch(/d19-3519\.pdf$/);
    expect(antrag.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Drucksachen', () => {
  it('makes one unit of an Anfrage and its Antwort, dated by the answer', () => {
    const pair = entries('anfrageMitAntwort');
    const [unit] = drucksacheUnitsOf(pair);
    expect(unit.entries.map((e) => e.docType).sort()).toEqual(['Antwort', 'Schriftliche Anfrage']);
    expect(isPendingAnfrage(unit)).toBe(false);
    expect(latestDateOf(unit.entries)).toBe(pair.find((e) => e.docType === 'Antwort')!.publishedAt);
  });

  it('holds back an Anfrage that has no answer yet', () => {
    const [unit] = drucksacheUnitsOf(entries('anfrageOhneAntwort'));
    expect(isPendingAnfrage(unit)).toBe(true);
  });

  it('keys a document by its file', () => {
    expect(fileKeyOf('https://x/VT/19/SchrAnfr/S19-27175.pdf')).toBe('s19-27175');
    expect(fileKeyOf('https://x/PlenarPr/p19-091bs3007%20Neu.pdf')).toBe('p19-091bs3007-neu');
  });

  it('carries party, Senat, Politikfeld and Sachgebiet in the payload', () => {
    const pair = entries('anfrageMitAntwort');
    const payload = documentPayloadOf(
      {
        documentId: 'agh-s19-27154',
        part: 'drucksache',
        title: pair[0].title,
        sourceUrl: pair[0].pdfUrls[0].url,
        documentNumber: pair[0].documentNumber,
        publishedAt: latestDateOf(pair),
        entries: pair,
      },
      'Johannes-Evangelist-Friedhof in Mitte: Bebauung des Friedhofs in der Liesenstraße'
    );
    expect(payload.party).toContain('Senat');
    expect(payload.subcategories).toEqual(['Friedhof']);
    expect(payload.primary_category).toContain('Bauen, Wohnen & Stadtentwicklung');
    expect(payload.doc_type).toEqual(expect.arrayContaining(['Antwort', 'Schriftliche Anfrage']));
  });
});

describe('urheberOf', () => {
  it.each([
    ['Grüne', 'GRÜNE'],
    ['Die Linke', 'Die Linke'],
    ['CDU', 'CDU'],
    ['fraktionslos', 'fraktionslos'],
    ['Senatsverwaltung für Finanzen', 'Senat'],
    ['Senatorin für Inneres und Sport', 'Senat'],
    ['Regierender Bürgermeister', 'Senat'],
    ['Der Regierende Bürgermeister von Berlin - Senatskanzlei', 'Senat'],
    ['SenIAS', 'Senat'],
    ['Ausschuss für Sport', null],
    ['Staatssekretär', null],
  ])('%s → %s', (name, expected) => {
    expect(urheberOf(name)).toBe(expected);
  });
});

describe('Plenarprotokolle', () => {
  it('reads printed page lists and ranges', () => {
    expect(printedPagesOf({ from: '9400', to: '9403' })).toEqual([9400, 9401, 9402, 9403]);
    expect(printedPagesOf({ from: '9305, 9230, 9231', to: null })).toEqual([9230, 9231, 9305]);
    expect(printedPagesOf(null)).toEqual([]);
    // Ein unplausibler Bereich darf nicht still auf die erste Seite schrumpfen.
    expect(printedPagesOf({ from: '9406', to: '9400' })).toEqual([]);
    expect(printedPagesOf({ from: '9400', to: '19400' })).toEqual([]);
  });

  it('groups entries that share pages into one unit', () => {
    const units = plenarUnitsOf(entries('plenar91'));
    const shared = units.find((u) => u.entries.length > 1);
    expect(shared?.entries.map((e) => e.docType).sort()).toEqual(['Antwort', 'Mündliche Anfrage']);
    // Die Antwort reicht eine Seite weiter als die Frage.
    expect(shared?.printedPages).toEqual([9382, 9383, 9384]);
    expect(units).toHaveLength(3);
    expect(units.every((u) => u.protocolUrl.endsWith('p19-091-wp.pdf'))).toBe(true);
  });

  it('finds the printed page offset from the page headers', () => {
    const pages = splitPages(read('p19-091-wp.txt'));
    const offset = printedPageOffsetOf(pages);
    expect(offset).toBe(9336);
    expect(plenarPagesOf(pages, offset!, [9338, 9339]).map((p) => p.page)).toEqual([9338, 9339]);
  });
});

describe('Ausschussprotokolle', () => {
  const session = ausschussSessionsOf(entries('ausschussSession'))[0];
  const wort = { url: session.wortprotokoll!, tops: splitTops(read('bem19-078-wp.txt')) };
  const inhalt = { url: session.inhaltsprotokoll!, tops: splitTops(read('bem19-078-ip.txt')) };

  it('groups the session and knows both protocols', () => {
    expect(session.wortprotokoll).toMatch(/bem19-078-wp\.pdf$/);
    expect(session.inhaltsprotokoll).toMatch(/bem19-078-ip\.pdf$/);
    expect(session.entries).toHaveLength(7);
  });

  it('splits at every Tagesordnungspunkt in order, each starting with its page', () => {
    expect(wort.tops.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(wort.tops.every((t) => /^## Seite \d+/.test(t.text))).toBe(true);
    expect(wort.tops[3].heading).toMatch(/^Besprechung gemäß § 21 Abs\. 3 GO/);
  });

  it('ignores a reference to a later point on its own line', () => {
    const text =
      '## Seite 1\n\nPunkt 1 der Tagesordnung\nA\nPunkt 3 der Tagesordnung\nB\nPunkt 2 der Tagesordnung\nC';
    expect(splitTops(text).map((t) => [t.number, t.text.includes('Punkt 3')])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('takes the verbatim text where there is one, the summary elsewhere', () => {
    const chosen = chooseTops(wort, inhalt);
    const source = Object.fromEntries(chosen.map((t) => [t.number, t.sourceUrl]));
    expect(source[1]).toBe(inhalt.url); // „Siehe Inhaltsprotokoll." im Wortprotokoll
    expect(source[4]).toBe(wort.url);
    expect(source[5]).toBe(wort.url);
  });

  it('matches every PARDOK entry of the session to its point', () => {
    const chosen = chooseTops(wort, inhalt);
    const matched = chosen.flatMap((t) => entriesOfTop(t, session.entries).map((e) => e.id));
    expect(new Set(matched)).toEqual(new Set(session.entries.map((e) => e.id)));
    const top1 = chosen.find((t) => t.number === 1)!;
    expect(entriesOfTop(top1, session.entries)).toEqual([]);
  });

  it('names the committee in the header and payload', () => {
    const top = chooseTops(wort, inhalt).find((t) => t.number === 4)!;
    const matched = entriesOfTop(top, session.entries);
    const unit = {
      documentId: 'agh-bem19-078-top4',
      part: 'ausschussprotokoll' as const,
      title: matched[0].title,
      sourceUrl: top.sourceUrl,
      documentNumber: '78',
      publishedAt: matched[0].publishedAt,
      entries: matched,
      segment: { protocolId: 'agh-bem19-078', index: 3, count: 9 },
    };
    expect(headerTextOf(unit)).toContain('Ausschuss für Bundes- und Europaangelegenheiten, Medien');
    expect(documentPayloadOf(unit, top.text)).toMatchObject({
      gremium: ['Ausschuss für Bundes- und Europaangelegenheiten, Medien'],
      protocol_id: 'agh-bem19-078',
      segment_index: 3,
      segment_count: 9,
    });
  });
});

describe('Filterfelder aus dem Text', () => {
  const wort = read('bem19-078-wp.txt');
  const inhalt = read('bem19-078-ip.txt');

  it('reads speakers with their faction, the Senat, and not the chair', () => {
    const speakers = speakersOf(wort);
    expect(speakers).toContainEqual({ name: 'Robert Eschricht', party: 'AfD' });
    expect(speakersOf('Staatssekretär Florian Graf (CdS): Herr Vorsitzender!')).toEqual([
      { name: 'Florian Graf', party: 'Senat' },
    ]);
    expect(speakers.map((s) => s.name)).not.toContain('Andreas Otto');
  });

  it('skips interjections, also when they run over several lines', () => {
    const text = [
      '## Werner Graf (GRÜNE):',
      'Sehr geehrte Frau Präsidentin!',
      '[Beifall bei der CDU –',
      'Torsten Schneider (SPD): So wenig?]',
      '[Kurt Wansner (CDU): Ach, was!]',
      'Dirk Stettner (CDU) ................ 9348',
      '## Senatorin Ute Bonde:',
    ].join('\n');
    expect(speakersOf(text)).toEqual([
      { name: 'Werner Graf', party: 'GRÜNE' },
      { name: 'Ute Bonde', party: 'Senat' },
    ]);
  });

  it('reads votes only after a voting question', () => {
    const plenar = [
      'Den haben Sie abgelehnt.',
      'Wer stimmt dagegen? – Das sind die Fraktionen der SPD und der CDU. Enthaltungen? – Bei der',
      'AfD-Fraktion. Damit ist der Antrag abgelehnt.',
      'Vorgeschlagen wird die Überweisung des Antrags an den Hauptausschuss. – Widerspruch höre',
      'ich nicht, dann verfahren wir so.',
    ].join('\n');
    expect(ergebnisOf(plenar, 'plenarprotokoll')).toEqual(['abgelehnt', 'überwiesen']);
    expect(ergebnisOf('Den haben Sie abgelehnt.', 'plenarprotokoll')).toEqual([]);
  });

  it('reads committee recommendations per agenda item', () => {
    const tops = splitTops(inhalt);
    expect(ergebnisOf(tops.find((t) => t.number === 10)!.text, 'ausschussprotokoll')).toEqual([
      'abgelehnt',
    ]);
    expect(ergebnisOf(tops.find((t) => t.number === 1)!.text, 'ausschussprotokoll')).toEqual([]);
  });

  it('normalises PARDOK names and keeps normalised ones', () => {
    expect(personName('Schulze, Tobias')).toBe('Tobias Schulze');
    expect(personName('Tobias Schulze')).toBe('Tobias Schulze');
  });

  it('finds the Bezirk of a Drucksache through its Ortsteil, but not „Mitte" alone', () => {
    const fields = (title: string, text = '') =>
      filterFieldsOf({ part: 'drucksache', title, text, urheber: [], parties: [] });
    expect(fields('Verkehrsberuhigung in Moabit').region).toEqual(['Mitte']);
    expect(fields('Schwimmbad in Rudow', 'Neuköllner Bäder').region).toEqual(['Neukölln']);
    expect(fields('Die Mitte der Gesellschaft stärken').region).toEqual([]);
  });

  it('takes speakers and factions of a protocol from the text and the entries', () => {
    const fields = filterFieldsOf({
      part: 'plenarprotokoll',
      title: 'Berlin wählt',
      text: '## Werner Graf (GRÜNE):\nText',
      urheber: ['Simon, Roman'],
      parties: ['CDU'],
    });
    expect(fields.speakers).toEqual(['Roman Simon', 'Werner Graf']);
    expect(fields.speaker_party).toEqual(['CDU', 'GRÜNE']);
  });
});
