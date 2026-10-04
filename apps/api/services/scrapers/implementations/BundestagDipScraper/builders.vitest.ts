import { describe, expect, it } from 'vitest';

import {
  buildSubcategoryFilter,
  getSystemCollectionConfig,
  type SubcategoryFilters,
} from '../../../../config/systemCollectionsConfig.js';

import {
  buildDrucksacheParent,
  buildProtokollParent,
  dipPointId,
  drucksachePdfUrl,
  protokollPdfUrl,
  unitPayload,
} from './builders.js';
import { normalizeParty, partiesFromHeader, partiesFromUrheber } from './factions.js';

const protokoll = buildProtokollParent(
  { id: '5806', dokumentnummer: '21/90', wahlperiode: 21, datum: '2026-07-10' },
  [
    {
      speaker: 'Katharina Dröge',
      party: 'GRÜNE',
      text: 'Frau Präsidentin! …',
      speechType: 'rede',
      isGovernment: false,
    },
  ],
  'hash-1'
);

const drucksache = buildDrucksacheParent(
  {
    id: '312345',
    dokumentnummer: '21/4268',
    drucksachetyp: 'Gesetzentwurf',
    wahlperiode: 21,
    datum: '2026-02-24',
    titel: 'Entwurf eines Gesetzes zur Stärkung des sozialen Mietrechts',
    urheber: ['Fraktion BÜNDNIS 90/DIE GRÜNEN', 'Fraktion Die Linke'],
  },
  [{ sectionType: 'loesung', title: 'B. Lösung', text: 'Die Mietpreisbremse wird entfristet.' }],
  null
);

describe('Fraktionen', () => {
  it.each([
    ['BÜNDNIS 90/DIE GRÜNEN', 'GRÜNE'],
    ['GRÜNE', 'GRÜNE'],
    ['CDU/CSU', 'CDU/CSU'],
    ['DIE LINKE', 'DIE LINKE'],
    ['Die Linke', 'DIE LINKE'],
    ['AfD', 'AfD'],
    ['SPD', 'SPD'],
    ['FDP', 'FDP'],
    ['BSW', 'BSW'],
    ['fraktionslos', 'fraktionslos'],
    ['Niedersachsen', null],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeParty(raw)).toBe(expected);
  });

  it('liest die Fraktion aus dem Kopf, solange DIP keine Urheber führt', () => {
    // Drucksache 21/8314, live abgerufen am 04.10.2026 — `urheber` war leer.
    const head =
      'Deutscher Bundestag Drucksache 21/8314 \n21. Wahlperiode 01.10.2026 \nAntrag \n' +
      'Abgeordneten Misbah Khan, Timon Dzienus, Lisa Paus, Julia Schneider und der \n' +
      'Fraktion BÜNDNIS 90/DIE GRÜNEN \nAlleinerziehende entlasten und Kinderarmut bekämpfen \nDer Bun';
    expect(partiesFromHeader(head)).toEqual(['GRÜNE']);
    expect(partiesFromHeader('Antrag der Fraktionen der CDU/CSU und SPD\nStarke Kommunen')).toEqual(
      ['CDU/CSU', 'SPD']
    );
    expect(partiesFromHeader('Gesetzentwurf der Bundesregierung')).toEqual([]);
  });

  it('nimmt aus den Urhebern nur Fraktionen', () => {
    expect(
      partiesFromUrheber(['Bundesregierung', 'Fraktion der CDU/CSU', 'Fraktion der SPD'])
    ).toEqual(['CDU/CSU', 'SPD']);
  });
});

describe('Einheiten', () => {
  it('führt jede Rede als eigene Einheit unter dem Protokoll', () => {
    expect(protokoll.parentId).toBe('protokoll:5806');
    expect(protokoll.units[0]).toMatchObject({
      documentId: 'rede:5806:0',
      title: 'Rede von Katharina Dröge (GRÜNE) – Plenarprotokoll 21/90, 10.07.2026',
      headingPath: ['Plenarprotokoll 21/90', 'Katharina Dröge'],
      sourceUrl: 'https://dserver.bundestag.de/btp/21/21090.pdf#rede-1',
      wahlperiode: '21',
      party: ['GRÜNE'],
    });
  });

  it('gibt einer gemeinsamen Drucksache alle einbringenden Fraktionen', () => {
    expect(drucksache.units[0]).toMatchObject({
      documentId: 'drucksache:312345:0',
      party: ['GRÜNE', 'DIE LINKE'],
      sectionType: 'loesung',
      headingPath: ['Gesetzentwurf 21/4268', 'B. Lösung'],
    });
  });

  it('baut dserver-Links aus der Dokumentnummer', () => {
    expect(drucksachePdfUrl('21/4268')).toBe('https://dserver.bundestag.de/btd/21/042/2104268.pdf');
    expect(drucksachePdfUrl('20/123')).toBe('https://dserver.bundestag.de/btd/20/001/2000123.pdf');
    expect(protokollPdfUrl('19/7')).toBe('https://dserver.bundestag.de/btp/19/19007.pdf');
  });

  it('vergibt deterministische, je Chunk verschiedene UUIDs', () => {
    expect(dipPointId('rede:5806:0', 0)).toBe(dipPointId('rede:5806:0', 0));
    expect(dipPointId('rede:5806:0', 0)).not.toBe(dipPointId('rede:5806:0', 1));
    expect(dipPointId('rede:5806:0', 0)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('Vertrag mit den Notebook-Filtern', () => {
  const config = getSystemCollectionConfig('bundestag-dip-system');
  const payloads = [
    unitPayload(protokoll.units[0], protokoll),
    unitPayload(drucksache.units[0], drucksache),
  ];

  it('schreibt jedes deklarierte Filterfeld in den Payload', () => {
    expect(config).not.toBeNull();
    const missing = config!.filterableFields
      .map((f) => f.field)
      .filter((field) => !payloads.some((p) => p[field] != null));
    expect(missing).toEqual([]);
  });

  it('übersetzt jedes Keyword-Filterfeld in eine Qdrant-Bedingung auf denselben Schlüssel', () => {
    for (const field of config!.filterableFields) {
      if (field.type !== 'keyword') continue;
      const filter = buildSubcategoryFilter({ [field.field]: 'x' } as SubcategoryFilters);
      expect(filter?.must).toContainEqual({ key: field.field, match: { value: 'x' } });
    }
  });

  it('hält `chunk_type` frei für das Strukturfeld des Chunkers', () => {
    for (const payload of payloads) expect(payload).not.toHaveProperty('chunk_type');
  });
});
