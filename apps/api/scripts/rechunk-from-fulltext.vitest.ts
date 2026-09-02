import { describe, expect, it } from 'vitest';

import {
  checkIdRecipe,
  leftoverPointIds,
  parseArgs,
  pointIdRecipeFor,
  rebuildChunkPayload,
  upsertBatches,
  type RechunkPoint,
} from './rechunk-from-fulltext.js';

import { type Chunk, type ChunkMetadata } from '../services/document-services/TextChunker/types.js';

/**
 * Die drei lebenden Kopf-Punkt-IDs von `grundsatz_documents`, am 02.09.2026
 * gegen die Produktions-Qdrant gemessen (Spec, Abschnitt C) und aus den
 * `documentId`-Werten in `ProgramPdfScraper.ts:80-106` reproduzierbar.
 */
const GRUNDSATZ_HEAD_IDS: Array<{ documentId: string; id: number }> = [
  { documentId: '20200125_Grundsatzprogramm', id: 1461662554 },
  { documentId: '20240306_Reader_EU-Wahlprogramm2024_A4', id: 143658016 },
  { documentId: '20250318_Regierungsprogramm_DIGITAL_DINA5', id: 1652781759 },
];

/**
 * Für `landesverbaende_documents` nennt die Spec keine Beispiel-URL, nur das
 * Ergebnis (200/200 lebende Kopf-Punkte getroffen). Dieser Anker hält also das
 * REZEPT fest, nicht eine lebende Zeile; der Abgleich gegen den echten Bestand
 * ist die Vorbedingung, die das Skript zur Laufzeit selbst fährt.
 */
const LV_URL = 'https://www.gruene-bw.de/wp-content/uploads/2025/03/beschluss-waermewende.pdf';

describe('pointIdRecipeFor', () => {
  it('rechnet die drei lebenden grundsatz-IDs exakt nach', () => {
    const recipe = pointIdRecipeFor('grundsatz_documents');
    expect(recipe?.idKey).toBe('document_id');
    for (const { documentId, id } of GRUNDSATZ_HEAD_IDS) {
      expect(recipe?.id(documentId, 0)).toBe(id);
    }
  });

  it('benutzt für landesverbaende_documents source_url, nicht document_id', () => {
    const recipe = pointIdRecipeFor('landesverbaende_documents');
    expect(recipe?.idKey).toBe('source_url');
    expect(recipe?.id(LV_URL, 0)).toBe(98221080);
    expect(recipe?.id(LV_URL, 1)).toBe(98221079);
  });

  it('kennt kein Rezept für documents — die Sammlung ist tabu', () => {
    expect(pointIdRecipeFor('documents')).toBeNull();
    expect(pointIdRecipeFor('kommunalwiki_documents')).toBeNull();
  });
});

describe('checkIdRecipe', () => {
  const recipe = pointIdRecipeFor('grundsatz_documents')!;

  it('bestätigt Punkte, die dem Rezept folgen', () => {
    const check = checkIdRecipe(
      GRUNDSATZ_HEAD_IDS.map(({ documentId, id }) => ({
        id,
        payload: { document_id: documentId, chunk_index: 0 },
      })),
      recipe
    );

    expect(check).toEqual({ checked: 3, matched: 3, mismatches: [] });
  });

  it('meldet eine einzige Abweichung — das reicht für den Abbruch', () => {
    const check = checkIdRecipe(
      [
        { id: 1461662554, payload: { document_id: '20200125_Grundsatzprogramm', chunk_index: 0 } },
        // Dieselbe Sache nach dem md5-Rezept aus reprocess-pdfs.ts:303-306:
        // parseInt(md5('20200125_Grundsatzprogramm:1').slice(0, 15), 16).
        // Dieselbe Sammlung, dasselbe Dokument — ein anderer Punkt.
        {
          id: 333119085792083840,
          payload: { document_id: '20200125_Grundsatzprogramm', chunk_index: 1 },
        },
      ],
      recipe
    );

    expect(check.checked).toBe(2);
    expect(check.matched).toBe(1);
    expect(check.mismatches).toEqual([
      {
        id: 333119085792083840,
        key: '20200125_Grundsatzprogramm',
        chunkIndex: 1,
        expected: 1461662555,
      },
    ]);
  });

  it('zählt einen Punkt ohne Schlüsselfeld als Abweichung, nicht als Treffer', () => {
    const check = checkIdRecipe([{ id: 1, payload: { chunk_index: 0 } }], recipe);

    expect(check.matched).toBe(0);
    expect(check.mismatches).toHaveLength(1);
  });
});

describe('parseArgs', () => {
  it('verlangt --collection', () => {
    expect(() => parseArgs([])).toThrow(/--collection/);
  });

  it('liest alle Schalter', () => {
    expect(parseArgs(['--collection', 'grundsatz_documents', '--dry-run', '--limit', '5'])).toEqual(
      {
        collection: 'grundsatz_documents',
        dryRun: true,
        onlyStructured: false,
        resume: false,
        limit: 5,
      }
    );
  });

  it('kennt --only-structured und --resume', () => {
    const args = parseArgs([
      '--collection',
      'landesverbaende_documents',
      '--only-structured',
      '--resume',
    ]);
    expect(args.onlyStructured).toBe(true);
    expect(args.resume).toBe(true);
    expect(args.limit).toBe(Infinity);
  });

  it('lehnt ein unbekanntes Argument ab, statt es zu ignorieren', () => {
    expect(() => parseArgs(['--collection', 'x', '--all'])).toThrow(/--all/);
  });
});

/** Ein Kopf-Payload, wie ihn `landesverbaende_documents` wirklich trägt. */
const HEAD_PAYLOAD: Record<string, unknown> = {
  document_id: 'lv_9f1c',
  source_url: 'https://www.gruene-bw.de/beschluss.pdf',
  landesverband: 'BW',
  title: 'Beschluss Wärmewende',
  // Spar-Gatter der Scraper — fallen sie weg, löst der nächste nächtliche Lauf
  // einen vollen Neu-Download samt OCR aus.
  content_hash: 'aa11',
  file_hash: 'bb22',
  source_etag: 'W/"cc33"',
  source_last_modified: 'Mon, 01 Sep 2026 10:00:00 GMT',
  // NLP-Facetten, auf JEDEM Chunk (notebookEnrichmentService.ts:8-11).
  themes: ['Klima', 'Wirtschaft'],
  primary_topic: 'Klima',
  persons: ['Ricarda Lang'],
  nlp_enriched_at: '2026-08-30T00:00:00.000Z',
  nlp_version: 3,
  nlp_content_hash: 'dd44',
  // wird ersetzt
  chunk_index: 0,
  chunk_text: 'alter Text',
  quality_score: 0.42,
  indexed_at: '2026-08-01T00:00:00.000Z',
  full_text: 'ALTER VOLLTEXT',
};

const NOW = '2026-09-02T12:00:00.000Z';

function chunkOf(text: string, metadata: ChunkMetadata = {}): Chunk {
  return { text, index: 0, tokens: 7, metadata };
}

describe('rebuildChunkPayload', () => {
  it('trägt Spar-Gatter und NLP-Facetten unverändert weiter', () => {
    const payload = rebuildChunkPayload(HEAD_PAYLOAD, chunkOf('neuer Text'), {
      index: 1,
      fullText: 'NEUER VOLLTEXT',
      qualityScore: 0.9,
      now: NOW,
    });

    expect(payload.content_hash).toBe('aa11');
    expect(payload.file_hash).toBe('bb22');
    expect(payload.source_etag).toBe('W/"cc33"');
    expect(payload.source_last_modified).toBe('Mon, 01 Sep 2026 10:00:00 GMT');
    expect(payload.themes).toEqual(['Klima', 'Wirtschaft']);
    expect(payload.primary_topic).toBe('Klima');
    expect(payload.persons).toEqual(['Ricarda Lang']);
    expect(payload.nlp_version).toBe(3);
    expect(payload.nlp_content_hash).toBe('dd44');
    expect(payload.landesverband).toBe('BW');
  });

  it('ersetzt Text, Index, Güte und Zeitstempel', () => {
    const payload = rebuildChunkPayload(
      HEAD_PAYLOAD,
      chunkOf('neuer Text', { chunkingMethod: 'structure-blocks' }),
      { index: 1, fullText: 'NEUER VOLLTEXT', qualityScore: 0.9, now: NOW }
    );

    expect(payload.chunk_index).toBe(1);
    expect(payload.chunk_text).toBe('neuer Text');
    expect(payload.quality_score).toBe(0.9);
    expect(payload.indexed_at).toBe(NOW);
    expect(payload.rechunked_at).toBe(NOW);
    expect(payload.chunk_method).toBe('structure-blocks');
  });

  it('schreibt full_text nur auf Index 0', () => {
    const head = rebuildChunkPayload(HEAD_PAYLOAD, chunkOf('a'), {
      index: 0,
      fullText: 'NEUER VOLLTEXT',
      qualityScore: 0.5,
      now: NOW,
    });
    const tail = rebuildChunkPayload(HEAD_PAYLOAD, chunkOf('b'), {
      index: 3,
      fullText: 'NEUER VOLLTEXT',
      qualityScore: 0.5,
      now: NOW,
    });

    expect(head.full_text).toBe('NEUER VOLLTEXT');
    expect('full_text' in tail).toBe(false);
  });

  it('setzt die vier Strukturfelder immer, auch auf Fließtext', () => {
    const strukturiert = rebuildChunkPayload(
      HEAD_PAYLOAD,
      chunkOf('a', {
        headingPath: ['Kapitel 3', '3.1 Förderung'],
        heading: '3.1 Förderung',
        chunkType: 'table',
        sectionIndex: 2,
      }),
      { index: 0, fullText: 'x', qualityScore: 0.5, now: NOW }
    );
    const fliesstext = rebuildChunkPayload(HEAD_PAYLOAD, chunkOf('a'), {
      index: 0,
      fullText: 'x',
      qualityScore: 0.5,
      now: NOW,
    });

    expect(strukturiert.heading_path).toEqual(['Kapitel 3', '3.1 Förderung']);
    expect(strukturiert.chunk_type).toBe('table');
    expect(strukturiert.section_index).toBe(2);
    expect(fliesstext.heading_path).toBeNull();
    expect(fliesstext.chunk_type).toBe('text');
  });

  it('führt page_number mit, wenn der Kopf es trägt — und schätzt es sonst nie', () => {
    const mitSeite = rebuildChunkPayload({ ...HEAD_PAYLOAD, page_number: 12 }, chunkOf('a'), {
      index: 4,
      fullText: 'x',
      qualityScore: 0.5,
      now: NOW,
    });
    const ohneSeite = rebuildChunkPayload(HEAD_PAYLOAD, chunkOf('a'), {
      index: 4,
      fullText: 'x',
      qualityScore: 0.5,
      now: NOW,
    });

    expect(mitSeite.page_number).toBe(12);
    expect('page_number' in ohneSeite).toBe(false);
  });

  it('führt token_count nur, wo die Sammlung das Feld führt', () => {
    const mit = rebuildChunkPayload({ ...HEAD_PAYLOAD, token_count: 111 }, chunkOf('a'), {
      index: 0,
      fullText: 'x',
      qualityScore: 0.5,
      now: NOW,
    });
    const ohne = rebuildChunkPayload(HEAD_PAYLOAD, chunkOf('a'), {
      index: 0,
      fullText: 'x',
      qualityScore: 0.5,
      now: NOW,
    });

    expect(mit.token_count).toBe(7);
    expect('token_count' in ohne).toBe(false);
  });
});

describe('leftoverPointIds', () => {
  it('gibt die alten Punkte zurück, die die neue Menge nicht abdeckt (m > n)', () => {
    expect(leftoverPointIds([10, 11, 12, 13], [10, 11])).toEqual([12, 13]);
  });

  it('gibt nichts zurück, wenn die Mengen gleich gross sind (m = n)', () => {
    expect(leftoverPointIds([10, 11], [10, 11])).toEqual([]);
  });

  it('gibt nichts zurück, wenn die neue Menge grösser ist (m < n)', () => {
    expect(leftoverPointIds([10, 11], [10, 11, 12, 13])).toEqual([]);
  });
});

describe('upsertBatches', () => {
  function point(index: number, withFullText = false): RechunkPoint {
    return {
      id: index,
      vector: [0.1],
      payload: { chunk_index: index, ...(withFullText ? { full_text: 'x' } : {}) },
    };
  }

  it('schickt den Punkt mit full_text allein', () => {
    const batches = upsertBatches([point(0, true), point(1), point(2)]);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].payload.full_text).toBe('x');
    expect(batches[1]).toHaveLength(2);
  });

  it('stapelt die übrigen zu 16', () => {
    const points = [point(0, true), ...Array.from({ length: 35 }, (_, i) => point(i + 1))];
    const batches = upsertBatches(points);

    expect(batches.map((b) => b.length)).toEqual([1, 16, 16, 3]);
  });

  it('gibt für eine leere Liste keine Stapel zurück', () => {
    expect(upsertBatches([])).toEqual([]);
  });
});
