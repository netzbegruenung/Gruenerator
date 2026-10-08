import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  anfrageAuthorOf,
  classifyDocType,
  documentIdOf,
  documentPayloadOf,
  groupByDocument,
  headerTextOf,
  protocolSpeakersOf,
  urheberOf,
} from './builders.js';
import { parseListPage } from './listParser.js';

const fixture = (name: string): string =>
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__', name),
    'utf8'
  );

const drucksachen = parseListPage(fixture('drucksachen.html')).entries;
const protokolle = parseListPage(fixture('plenarprotokolle.html')).entries;

describe('classifyDocType', () => {
  it.each([
    ['Antrag CSU, FREIE WÄHLER', 'Antrag'],
    ['Dringlichkeitsantrag BÜNDNIS 90/DIE GRÜNEN', 'Dringlichkeitsantrag'],
    [
      'Beschlussempfehlung mit Bericht zu Änderungsantrag FREIE WÄHLER, CSU DRS 19/5595',
      'Beschlussempfehlung mit Bericht',
    ],
    ['Beschluss des Plenums zu Antrag SPD', 'Beschluss des Plenums'],
    ['Schriftliche Anfrage SPD', 'Schriftliche Anfrage'],
    ['Anfragen zum Plenum SPD', 'Anfragen zum Plenum'],
    ['2. Lesung zu Gesetzentwurf Staatsregierung', '2. Lesung'],
    ['Neuartiger Typ CSU', 'Neuartiger'],
  ])('%s → %s', (descriptor, expected) => {
    expect(classifyDocType(descriptor)).toBe(expected);
  });
});

describe('urheberOf', () => {
  it('reads factions and the state government from the own part', () => {
    expect(urheberOf('Antrag CSU, FREIE WÄHLER')).toEqual(['CSU', 'FREIE WÄHLER']);
    expect(urheberOf('Gesetzentwurf Staatsregierung')).toEqual(['Staatsregierung']);
    expect(urheberOf('Dringlichkeitsantrag BÜNDNIS 90/DIE GRÜNEN')).toEqual(['GRÜNE']);
  });

  it('ignores the authors of the referenced Vorgang behind „zu"', () => {
    expect(urheberOf('Beschlussempfehlung mit Bericht zu Antrag SPD DRS 19/510')).toEqual([]);
  });
});

describe('documentIdOf', () => {
  it('keeps base and follow-up Drucksachen apart', () => {
    expect(documentIdOf(drucksachen[0].pdfUrl)).toBe(
      'ltby-wp19-drucksachen-basisdrucksachen-0000011500-0000011553'
    );
    expect(documentIdOf(drucksachen[2].pdfUrl)).toBe(
      'ltby-wp19-drucksachen-folgedrucksachen-0000003000-0000003400'
    );
  });

  it('names protocol excerpts by their file name', () => {
    expect(documentIdOf(protokolle[0].pdfUrl)).toBe(
      'ltby-wp19-protokoll-087-pl-005-dringlichkeitsantrag-12974'
    );
  });
});

describe('groupByDocument', () => {
  it('stores a PDF listed for several Vorgänge once, with every title', () => {
    const docs = groupByDocument(drucksachen);
    expect(docs).toHaveLength(5);
    const sammel = docs[2];
    expect(sammel.entry.documentNumber).toBe('19/5930');
    expect(sammel.titles).toHaveLength(3);
    expect(sammel.titles[1]).toContain('Recherche- und Informationsstelle Antisemitismus');
  });

  it('does not repeat a title when the same Vorgang is listed twice', () => {
    expect(groupByDocument(protokolle).map((d) => d.titles.length)).toEqual([1, 1]);
  });

  it('names the other Vorgänge in the header', () => {
    const header = headerTextOf(groupByDocument(drucksachen)[2]);
    expect(header).toContain('Drucksache 19/5930 vom 18.03.2025 (Bayerischer Landtag)');
    expect(header).toContain('Betrifft auch:');
    expect(header).toContain('- Änderungsantrag Nachtragshaushaltsplan 2025; hier: Zuschüsse');
  });
});

describe('speakers', () => {
  it('reads who spoke in a protocol excerpt, without interjections or the chair', () => {
    expect(protocolSpeakersOf(fixture('protokoll-087-005.txt'))).toEqual([
      { name: 'Roland Weigert', party: 'FREIE WÄHLER' },
      { name: 'Dieter Arnold', party: 'AfD' },
      { name: 'Florian Siekmann', party: 'GRÜNE' },
      { name: 'Christiane Feichtmeier', party: 'SPD' },
      { name: 'Holger Dremel', party: 'CSU' },
      { name: 'Florian Köhler', party: 'AfD' },
      { name: 'Michael Hofmann', party: 'CSU' },
    ]);
  });

  it('counts members of the state government as Staatsregierung', () => {
    expect(
      protocolSpeakersOf('Staatsminister Joachim Herrmann (Innenministerium): Herr Präsident!')
    ).toEqual([{ name: 'Joachim Herrmann', party: 'Staatsregierung' }]);
  });

  it('reads the author of a Schriftliche Anfrage', () => {
    expect(anfrageAuthorOf(fixture('anfrage-19-13391.txt'))).toEqual({
      name: 'Anna Rasehorn',
      party: 'SPD',
    });
  });
});

describe('documentPayloadOf', () => {
  it('fills the filter fields of a Schriftliche Anfrage', () => {
    const [doc] = groupByDocument([drucksachen[5]]);
    expect(documentPayloadOf(doc, fixture('anfrage-19-13391.txt'))).toMatchObject({
      document_id: 'ltby-wp19-drucksachen-schriftliche-anfragen-19-0013391',
      source: 'landtag-bayern',
      content_type: 'drucksache',
      doc_type: 'Schriftliche Anfrage',
      document_number: '19/13391',
      party: ['SPD'],
      speakers: ['Anna Rasehorn'],
      speaker_party: ['SPD'],
    });
  });

  it('keeps the Landtag Schlagworte out of `keywords`, which NLP enrichment overwrites', () => {
    const [doc] = groupByDocument([drucksachen[5]]);
    const payload = documentPayloadOf(doc, fixture('anfrage-19-13391.txt'));
    expect(payload.schlagworte).toEqual(expect.arrayContaining(['Erdölgewinnung', 'Erdgas']));
    expect(payload).not.toHaveProperty('keywords');
  });

  it('leaves the party of a protocol empty and takes the speakers from the text', () => {
    const [doc] = groupByDocument([protokolle[0]]);
    const payload = documentPayloadOf(doc, fixture('protokoll-087-005.txt'));
    expect(payload).toMatchObject({ content_type: 'plenarprotokoll', party: [] });
    expect(payload.speaker_party).toEqual(['FREIE WÄHLER', 'AfD', 'GRÜNE', 'SPD', 'CSU']);
  });
});
