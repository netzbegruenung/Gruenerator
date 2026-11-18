/**
 * #5568: ein nur aufs Jahr bekanntes Datum darf im Prompt keinen Monat tragen.
 *
 * Der Landesverband-Scraper schreibt ein Jahresdatum als `YYYY-06-15` mit
 * `date_precision: 'year'`. Das Feld muss von der Qdrant-Nutzlast über die
 * Gruppierung pro Dokument bis zum Quellenblock durch jede Schicht — fällt es
 * an einer aus, kommt `undefined` an, und der Prompt sagt wieder „Juni“.
 * Deshalb läuft der Test über die ganze Kette, nicht nur über `formatDe`.
 */
import { describe, it, expect, vi } from 'vitest';

import { BaseSearchService } from '../BaseSearchService/BaseSearchService.js';
import { buildChunkPayloadFields } from '../document-services/DocumentSearchService/searchOperations.js';

import { buildContextSummary } from './contextSummary.js';
import { formatDe, parseDatePrecision } from './recency.js';
import { buildReferencesMap, expandResultsToChunks } from './SearchResultProcessor.js';

import type { TransformedChunk } from '../BaseSearchService/types.js';

vi.mock('../scrapers/utils/wolkeShareSecrets.js', () => ({
  resolveWolkeDisplayUrl: (url: string) => url,
}));

const NOW = new Date('2026-11-09T12:00:00Z');

function chunkFrom(payload: Record<string, unknown>, index = 0): TransformedChunk {
  return {
    id: `c${index}`,
    similarity: 0.9,
    ...buildChunkPayloadFields({
      document_id: 'wps-fischerei',
      chunk_index: index,
      chunk_text: `Kormoran Abschnitt ${index}`,
      title: 'Wahlprüfstein Fischereiverband Saar',
      ...payload,
    }),
  } as unknown as TransformedChunk;
}

async function promptFor(payload: Record<string, unknown>, mode: 'vector' | 'hybrid') {
  const svc = new BaseSearchService({ serviceName: 'Test' });
  const chunks = [chunkFrom(payload)];
  const docs =
    mode === 'hybrid'
      ? await svc.groupAndRankHybridResults(chunks, 10, 'Kormoran', {})
      : await svc.groupAndRankResults(chunks, 10, 'Kormoran');
  const refs = buildReferencesMap(expandResultsToChunks(docs, 'saarland-system', 'Grüne Saarland'));
  return buildContextSummary(refs, NOW);
}

describe('date precision (#5568)', () => {
  it('formatDe zeigt bei Jahresgenauigkeit nur das Jahr', () => {
    expect(formatDe('2022-06-15', 'year')).toBe('2022');
    expect(formatDe('2022-06-15', 'month')).toBe('Juni 2022');
    expect(formatDe('2022-06-15')).toBe('Juni 2022');
    expect(formatDe(null, 'year')).toBe('');
  });

  it('liest nur die drei bekannten Werte', () => {
    expect(parseDatePrecision('year')).toBe('year');
    expect(parseDatePrecision('YEAR')).toBeNull();
    expect(parseDatePrecision(undefined)).toBeNull();
  });

  it('der Mapper trägt die Genauigkeit nur zum eigenen published_at', () => {
    expect(
      buildChunkPayloadFields({ published_at: '2022-06-15', date_precision: 'year' }).date_precision
    ).toBe('year');
    // Ein Metadaten-Datum hat keine Genauigkeit — die gehört zum Scraper-Feld.
    expect(
      buildChunkPayloadFields({ metadata: { published_at: '2022-06-15' }, date_precision: 'year' })
        .date_precision
    ).toBeNull();
  });

  it.each(['vector', 'hybrid'] as const)(
    'kommt im %s-Pfad als „Datum: 2022“ im Prompt an',
    async (mode) => {
      const out = await promptFor({ published_at: '2022-06-15', date_precision: 'year' }, mode);
      expect(out).toContain('(Datum: 2022) Wahlprüfstein Fischereiverband Saar');
      expect(out).not.toContain('Juni');
    }
  );

  it.each(['vector', 'hybrid'] as const)(
    'lässt ein tagesgenaues Datum im %s-Pfad unverändert',
    async (mode) => {
      const out = await promptFor({ published_at: '2024-03-15', date_precision: 'day' }, mode);
      expect(out).toContain('(Datum: März 2024)');
    }
  );

  it('ein Punkt ohne das Feld bleibt beim Monat (alle anderen Sammlungen)', async () => {
    const out = await promptFor({ published_at: '2024-03-15' }, 'hybrid');
    expect(out).toContain('(Datum: März 2024)');
  });
});
