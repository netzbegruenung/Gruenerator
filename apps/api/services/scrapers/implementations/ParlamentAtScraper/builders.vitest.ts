import { describe, expect, it } from 'vitest';

import {
  buildSubcategoryFilter,
  getSystemCollectionConfig,
  type SubcategoryFilters,
} from '../../../../config/systemCollectionsConfig.js';

import { atPointId, buildGegenstandParent, buildSitzungParent } from './builders.js';
import { normalizeParty } from './factions.js';
import { type ListRow } from './parlamentClient.js';
import { type ParsedSpeech } from './protokollHtml.js';

const speech = (over: Partial<ParsedSpeech>): ParsedSpeech => ({
  anchor: '32',
  speaker: 'Leonore Gewessler',
  party: 'GRÜNE',
  personId: '5653',
  isGovernment: false,
  role: 'contra',
  agenda: 'Bundesfinanzgesetz 2025',
  text: 'Budget ist in Zahlen gegossene Politik.',
  ...over,
});

const sitzung = buildSitzungParent(
  {
    gp: 'XXVIII',
    n: 30,
    datum: '2025-06-16',
    protokollPath: '/dokument/XXVIII/NRSITZ/30/fnameorig_1739891.html',
  },
  [
    speech({}),
    speech({
      anchor: '30',
      speaker: 'Christian Stocker',
      party: null,
      personId: '5439',
      isGovernment: true,
      role: 'regierungsbank',
    }),
  ],
  (personId) => (personId === '5439' ? 'ÖVP' : null),
  { contentHash: 'h1', rowHash: '/dokument/XXVIII/NRSITZ/30/fnameorig_1739891.html' }
);

const row: ListRow = {
  gp: 'XXVIII',
  ityp: 'J',
  inr: '4483',
  hisUrl: '/gegenstand/XXVIII/J/4483',
  title: 'Quartalsbericht der Reisekosten in Ihrem Ressort',
  zitation: '4483/J',
  doktypLang: 'Schriftliche Anfrage',
  datum: '2026-01-12',
  datumSort: '20260112',
  status: '5',
  phasenBis: '05',
  fraktionen: ['FPÖ'],
  themen: ['Inneres und Recht'],
};

const anfrage = buildGegenstandParent(
  { row, ministerium: 'Bundesministerium für Finanzen' },
  [
    {
      contentType: 'anfrage',
      title: 'Anfrage',
      path: '/dokument/XXVIII/J/4483/fnameorig_1738601.html',
      text: 'Wie hoch waren die Reisekosten?',
      party: ['FPÖ'],
      publishedAt: '2026-01-12',
    },
    {
      contentType: 'anfragebeantwortung',
      title: 'Anfragebeantwortung 3998/AB',
      path: '/dokument/XXVIII/AB/3998/imfname_1744532.pdf',
      text: 'Die Reisekosten betrugen …',
      party: ['SPÖ'],
      speaker: 'Dr. Markus Marterbauer',
      publishedAt: '2026-03-12',
    },
  ],
  { contentHash: 'h2', rowHash: 'r2' }
);

describe('normalizeParty', () => {
  it('versteht Codes, Kurz- und Klubnamen', () => {
    expect(normalizeParty('G')).toBe('GRÜNE');
    expect(normalizeParty('Grüne')).toBe('GRÜNE');
    expect(normalizeParty('Der Grüne Klub im Parlament - Klub der Grünen Abgeordneten')).toBe(
      'GRÜNE'
    );
    expect(normalizeParty('Parlamentsklub der Österreichischen Volkspartei')).toBe('ÖVP');
    expect(normalizeParty('Die Sozialdemokratische Parlamentsfraktion')).toBe('SPÖ');
    expect(normalizeParty('fortsetzend')).toBeNull();
  });
});

describe('buildSitzungParent', () => {
  it('gibt jeder Rede eine eigene Sprungmarke und ID', () => {
    expect(sitzung.parentId).toBe('nrsitz:XXVIII:30');
    expect(sitzung.units.map((u) => u.sourceUrl)).toEqual([
      'https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/30/fnameorig_1739891.html#32',
      'https://www.parlament.gv.at/dokument/XXVIII/NRSITZ/30/fnameorig_1739891.html#30',
    ]);
    expect(sitzung.units.map((u) => u.documentId)).toEqual([
      'rede:XXVIII:30:0',
      'rede:XXVIII:30:1',
    ]);
  });

  it('holt den Klub von Regierungsmitgliedern über die Person', () => {
    expect(sitzung.units[1].payload).toMatchObject({ party: ['ÖVP'], is_government: true });
    expect(sitzung.units[1].title).toBe(
      'Rede von Christian Stocker (ÖVP) – 30. Sitzung des Nationalrats, 16.06.2025'
    );
    expect(sitzung.units[0].headingPath).toEqual([
      '30. Sitzung des Nationalrats (XXVIII. GP)',
      'Bundesfinanzgesetz 2025',
      'Leonore Gewessler',
    ]);
  });
});

describe('buildGegenstandParent', () => {
  it('trennt Anfrage und Beantwortung mit eigenem Klub und Datum', () => {
    expect(anfrage.parentId).toBe('gegenstand:XXVIII:J:4483');
    expect(
      anfrage.units.map((u) => [u.payload.content_type, u.payload.party, u.payload.published_at])
    ).toEqual([
      ['anfrage', ['FPÖ'], '2026-01-12'],
      ['anfragebeantwortung', ['SPÖ'], '2026-03-12'],
    ]);
    expect(anfrage.units[1].payload).toMatchObject({
      speaker: 'Dr. Markus Marterbauer',
      ministerium: 'Bundesministerium für Finanzen',
      primary_category: ['Inneres und Recht'],
      row_hash: 'r2',
    });
  });

  it('vergibt deterministische, je Chunk verschiedene UUIDs', () => {
    expect(atPointId('XXVIII:J:4483:0', 0)).toBe(atPointId('XXVIII:J:4483:0', 0));
    expect(atPointId('XXVIII:J:4483:0', 0)).not.toBe(atPointId('XXVIII:J:4483:0', 1));
  });
});

describe('Vertrag mit den Notebook-Filtern', () => {
  const config = getSystemCollectionConfig('parlament-at-system');
  const payloads = [...sitzung.units, ...anfrage.units].map((u) => u.payload);

  it('schreibt jedes deklarierte Filterfeld in den Payload', () => {
    expect(config).not.toBeNull();
    const missing = config!.filterableFields
      .map((f) => f.field)
      .filter((field) => !payloads.some((p) => p[field] != null && p[field] !== ''));
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
