import { describe, expect, it } from 'vitest';

import {
  checkBm25Precondition,
  checkIdRecipe,
  isStructured,
  leftoverPointIds,
  parseArgs,
  pointIdRecipeFor,
  processDocument,
  rebuildChunkPayload,
  RechunkWriteError,
  RECOMPUTED_PAYLOAD_KEYS,
  scrollEach,
  summarizeOutcomes,
  upsertBatches,
  type DocumentGroup,
  type DocumentOutcome,
  type RechunkDeps,
  type RechunkPoint,
  type RunOptions,
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

/**
 * Die drei Sammlungen aus #3163. Auch hier halten die Zahlen das REZEPT fest,
 * nicht eine lebende Zeile: sie sind am 02.09.2026 gegen `chunkToNumericId` bzw.
 * `generatePointId` aus `utils/validation/hash.ts` gerechnet. Ob der lebende
 * Bestand sie trifft, prüft `checkIdRecipe` zur Laufzeit über JEDEN Punkt.
 *
 * Ein echter Lauf gegen diese drei ist NICHT vorgesehen (Spec, Offene Frage 4):
 * der reguläre Vollauf zerlegt sie ohnehin neu, weil die Reparatur jeden
 * `content_hash` ändert. Die Rezepte stehen hier für den TROCKENLAUF, der die
 * Abnahmezahl „davon struktur-wirksam" liefert.
 */
const BUNDESTAG_URL = 'https://www.gruene-bundestag.de/unsere-politik/fachtexte/klimaschutz';
const BOELL_URL = 'https://www.boell.de/de/2025/01/15/dossier-energiewende';
const GRUENE_AT_URL = 'https://www.gruene.at/themen/klima/energiewende';
const GRUENBLOG_URL = 'https://www.gruenblog.com/wissen/waermewende';

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

  it('rechnet bundestag_content OHNE Präfix — chunkToNumericId(url, index)', () => {
    const recipe = pointIdRecipeFor('bundestag_content');
    expect(recipe?.idKey).toBe('source_url');
    expect(recipe?.id(BUNDESTAG_URL, 0)).toBe(330046947);
    expect(recipe?.id(BUNDESTAG_URL, 1)).toBe(330046948);
  });

  it('rechnet boell_stiftung_documents mit dem Präfix boell', () => {
    const recipe = pointIdRecipeFor('boell_stiftung_documents');
    expect(recipe?.idKey).toBe('source_url');
    expect(recipe?.id(BOELL_URL, 0)).toBe(149266895);
    expect(recipe?.id(BOELL_URL, 1)).toBe(149266896);
  });

  it('rechnet gruene_at_documents mit dem Präfix gruene_at', () => {
    const recipe = pointIdRecipeFor('gruene_at_documents');
    expect(recipe?.idKey).toBe('source_url');
    expect(recipe?.id(GRUENE_AT_URL, 0)).toBe(1793081277);
    expect(recipe?.id(GRUENE_AT_URL, 1)).toBe(1793081278);
  });

  it('rechnet gruenblog_documents mit dem Präfix gruenblog', () => {
    const recipe = pointIdRecipeFor('gruenblog_documents');
    expect(recipe?.idKey).toBe('source_url');
    expect(recipe?.id(GRUENBLOG_URL, 0)).toBe(1916456806);
    expect(recipe?.id(GRUENBLOG_URL, 1)).toBe(1916456807);
  });

  it('kennt kein Rezept für documents — die Sammlung ist tabu', () => {
    expect(pointIdRecipeFor('documents')).toBeNull();
    expect(pointIdRecipeFor('kommunalwiki_documents')).toBeNull();
  });
});

describe('checkBm25Precondition', () => {
  it('bricht einen echten Lauf ohne bm25 ab', () => {
    const result = checkBm25Precondition('landesverbaende_documents', false, false);

    expect(result.proceed).toBe(false);
    expect(result.log).toEqual({
      level: 'error',
      message: expect.stringContaining('deklariert den Sparse-Vektor bm25 nicht'),
    });
  });

  it('lässt --dry-run trotz fehlendem bm25 durch — mit Warnung statt Abbruch (Finding 7)', () => {
    const result = checkBm25Precondition('landesverbaende_documents', false, true);

    expect(result.proceed).toBe(true);
    expect(result.log).toEqual({
      level: 'warn',
      message: expect.stringContaining('deklariert den Sparse-Vektor bm25 nicht'),
    });
  });

  it('meldet nichts, wenn bm25 da ist — egal ob dry-run', () => {
    expect(checkBm25Precondition('x', true, false)).toEqual({ proceed: true, log: null });
    expect(checkBm25Precondition('x', true, true)).toEqual({ proceed: true, log: null });
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
        reason: 'id_mismatch',
      },
    ]);
  });

  it('zählt einen Punkt ohne Schlüsselfeld als Abweichung, nicht als Treffer', () => {
    const check = checkIdRecipe([{ id: 1, payload: { chunk_index: 0 } }], recipe);

    expect(check.matched).toBe(0);
    expect(check.mismatches).toHaveLength(1);
    expect(check.mismatches[0].reason).toBe('missing_key');
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

  it('lehnt --collection ohne Wert ab, statt das nächste Flag zu schlucken', () => {
    expect(() => parseArgs(['--collection', '--dry-run'])).toThrow(/--collection/);
  });

  it('lehnt --limit 0 ab, statt unlimited daraus zu machen', () => {
    expect(() => parseArgs(['--collection', 'x', '--limit', '0'])).toThrow(/--limit/);
  });

  it('lehnt --limit abc ab, statt unlimited daraus zu machen', () => {
    expect(() => parseArgs(['--collection', 'x', '--limit', 'abc'])).toThrow(/--limit/);
  });

  it('lehnt ein negatives --limit ab', () => {
    expect(() => parseArgs(['--collection', 'x', '--limit', '-5'])).toThrow(/--limit/);
  });
});

describe('scrollEach', () => {
  it('verarbeitet jede Seite einzeln über die Callback — keine Gesamtmenge wird angesammelt', async () => {
    const pages = [
      {
        points: [
          { id: 1, payload: { a: 1 } },
          { id: 2, payload: { a: 2 } },
        ],
        next_page_offset: 'p2',
      },
      { points: [{ id: 3, payload: { a: 3 } }], next_page_offset: 'p3' },
      { points: [{ id: 4, payload: { a: 4 } }], next_page_offset: null },
    ];
    let scrollCalls = 0;
    const client = {
      scroll: async () => {
        const page = pages[scrollCalls];
        scrollCalls++;
        return page;
      },
      delete: async () => undefined,
    };

    const seenIds: Array<string | number> = [];
    const pageSizes: number[] = [];
    await scrollEach(client, 'col', {}, async (points) => {
      pageSizes.push(points.length);
      for (const point of points) seenIds.push(point.id);
    });

    // Jeder Kopf genau einmal, in der Reihenfolge der Seiten — nicht als eine
    // einzige zusammengefasste Liste am Ende.
    expect(seenIds).toEqual([1, 2, 3, 4]);
    expect(pageSizes).toEqual([2, 1, 1]);
    expect(scrollCalls).toBe(3);
  });

  it('holt keine weitere Seite, sobald die Callback stop meldet', async () => {
    const pages = [
      { points: [{ id: 1, payload: { a: 1 } }], next_page_offset: 'p2' },
      { points: [{ id: 2, payload: { a: 2 } }], next_page_offset: null },
    ];
    let scrollCalls = 0;
    const client = {
      scroll: async () => {
        const page = pages[scrollCalls];
        scrollCalls++;
        return page;
      },
      delete: async () => undefined,
    };

    const seenIds: Array<string | number> = [];
    await scrollEach(client, 'col', {}, async (points) => {
      for (const point of points) seenIds.push(point.id);
      return 'stop';
    });

    // `--limit` soll den Probelauf billig halten: nach dem Signal geht kein
    // zweiter Scroll-Aufruf mehr übers Netz.
    expect(seenIds).toEqual([1]);
    expect(scrollCalls).toBe(1);
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

describe('RECOMPUTED_PAYLOAD_KEYS', () => {
  it('ist die Ausschlussliste, die rebuildChunkPayload aus dem Kopf entfernt und neu setzt', () => {
    expect(RECOMPUTED_PAYLOAD_KEYS).toEqual([
      'chunk_index',
      'chunk_text',
      'heading_path',
      'heading',
      'chunk_type',
      'section_index',
      'quality_score',
      'token_count',
      'indexed_at',
      'page_number',
      'full_text',
      'rechunked_at',
      'chunk_method',
    ]);
  });
});

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
    expect(payload.chunk_method).toBe('structure-blocks');
  });

  it('setzt rechunked_at NIE im Upsert-Payload — der Kopf wird erst nach dem Löschen gestempelt', () => {
    const payload = rebuildChunkPayload(
      { ...HEAD_PAYLOAD, rechunked_at: '2026-08-01T00:00:00.000Z' },
      chunkOf('neuer Text'),
      { index: 0, fullText: 'NEUER VOLLTEXT', qualityScore: 0.9, now: NOW }
    );

    expect('rechunked_at' in payload).toBe(false);
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

describe('isStructured', () => {
  it('erkennt den Struktur-Pfad an structure-blocks', () => {
    expect(
      isStructured([
        { metadata: { chunkingMethod: 'structure-blocks' } },
        { metadata: { chunkingMethod: 'structure-blocks' } },
      ])
    ).toBe(true);
  });

  it('nennt den Fließtext-Schnellpfad unstrukturiert — egal welches alte Etikett er trägt', () => {
    expect(isStructured([{ metadata: { chunkingMethod: 'sentences' } }])).toBe(false);
    expect(isStructured([{ metadata: { chunkingMethod: 'langchain-sentences' } }])).toBe(false);
    expect(isStructured([{ metadata: {} }])).toBe(false);
    expect(isStructured([])).toBe(false);
  });
});

describe('summarizeOutcomes', () => {
  function outcome(over: Partial<DocumentOutcome>): DocumentOutcome {
    return {
      key: 'k',
      skipped: null,
      structured: false,
      oldChunks: 0,
      newChunks: 0,
      chars: 0,
      written: 0,
      deleted: 0,
      ...over,
    };
  }

  it('zählt grundsatz_documents richtig: drei Dokumente, keins mit full_text', () => {
    const summary = summarizeOutcomes([
      outcome({ key: 'a', skipped: 'no_full_text', oldChunks: 231 }),
      outcome({ key: 'b', skipped: 'no_full_text', oldChunks: 335 }),
      outcome({ key: 'c', skipped: 'no_full_text', oldChunks: 402 }),
    ]);

    expect(summary.documents).toBe(3);
    expect(summary.withFullText).toBe(0);
    expect(summary.withoutFullText).toBe(3);
    expect(summary.processed).toBe(0);
    expect(summary.newChunks).toBe(0);
    expect(summary.embeddingBatches).toBe(0);
  });

  it('trennt struktur-wirksame Dokumente vom Fließtext-Schnellpfad', () => {
    const summary = summarizeOutcomes([
      outcome({ key: 'a', structured: true, oldChunks: 4, newChunks: 6, chars: 12_000 }),
      outcome({ key: 'b', structured: false, oldChunks: 3, newChunks: 3, chars: 5_000 }),
      outcome({ key: 'c', skipped: 'no_full_text', oldChunks: 2 }),
    ]);

    expect(summary.withFullText).toBe(2);
    expect(summary.processed).toBe(2);
    expect(summary.processedStructured).toBe(1);
    expect(summary.oldChunks).toBe(7);
    expect(summary.newChunks).toBe(9);
    expect(summary.chars).toBe(17_000);
  });

  it('zählt Lösch-Aufrufe nur, wo die alte Menge grösser ist', () => {
    const summary = summarizeOutcomes([
      outcome({ key: 'a', oldChunks: 9, newChunks: 4 }),
      outcome({ key: 'b', oldChunks: 4, newChunks: 9 }),
      outcome({ key: 'c', oldChunks: 4, newChunks: 4 }),
    ]);

    expect(summary.deleteCalls).toBe(1);
  });

  it('rechnet die Einbettungsstapel je Dokument, nicht über den ganzen Lauf', () => {
    // 17 und 17 Chunks sind vier Stapel (2 + 2), nicht drei (ceil(34/16)).
    const summary = summarizeOutcomes([
      outcome({ key: 'a', newChunks: 17 }),
      outcome({ key: 'b', newChunks: 17 }),
    ]);

    expect(summary.embeddingBatches).toBe(4);
  });

  it('führt übersprungene Dokumente je Grund getrennt', () => {
    const summary = summarizeOutcomes([
      outcome({ key: 'a', skipped: 'fast_path', structured: false }),
      outcome({ key: 'b', skipped: 'already_rechunked' }),
      outcome({ key: 'c', skipped: 'no_chunks' }),
    ]);

    expect(summary.fastPathSkipped).toBe(1);
    expect(summary.alreadyRechunked).toBe(1);
    expect(summary.noChunks).toBe(1);
    expect(summary.processed).toBe(0);
  });

  it('zählt geworfene Dokumente als Fehler, nicht als erledigt oder übersprungen', () => {
    const summary = summarizeOutcomes([
      outcome({ key: 'a', skipped: 'error', oldChunks: 5 }),
      outcome({ key: 'b', structured: true, oldChunks: 3, newChunks: 3 }),
    ]);

    expect(summary.documents).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.processed).toBe(1);
    expect(summary.withFullText).toBe(1);
    expect(summary.withoutFullText).toBe(0);
  });
});

interface Recorded {
  calls: string[];
  upserted: RechunkPoint[];
  deleted: Array<string | number>;
  embedded: string[];
  payloadSet: Array<{ id: string | number; payload: Record<string, unknown> }>;
}

function fakeDeps(chunks: Chunk[]): { deps: RechunkDeps; log: Recorded } {
  const log: Recorded = { calls: [], upserted: [], deleted: [], embedded: [], payloadSet: [] };
  const deps: RechunkDeps = {
    chunk: async () => chunks,
    embed: async (texts) => {
      log.calls.push(`embed:${texts.length}`);
      log.embedded.push(...texts);
      return texts.map((_, i) => [i / 10]);
    },
    quality: () => 0.75,
    upsert: async (_collection, points) => {
      log.calls.push(`upsert:${points.length}`);
      log.upserted.push(...points);
    },
    deletePoints: async (_collection, ids) => {
      log.calls.push(`delete:${ids.length}`);
      log.deleted.push(...ids);
    },
    setPayload: async (_collection, pointId, payload) => {
      log.calls.push(`setPayload:${pointId}`);
      log.payloadSet.push({ id: pointId, payload });
    },
    now: () => NOW,
  };
  return { deps, log };
}

const RUN: RunOptions = { dryRun: false, onlyStructured: false, resume: false };

function lvDoc(over: Partial<DocumentGroup> = {}): DocumentGroup {
  return {
    key: 'https://www.gruene-bw.de/beschluss.pdf',
    headPayload: { ...HEAD_PAYLOAD, full_text: 'NEUER VOLLTEXT' },
    pointIds: [],
    ...over,
  };
}

function structuredChunks(n: number): Chunk[] {
  return Array.from({ length: n }, (_, i) => ({
    text: `Chunk ${i}`,
    index: i,
    tokens: 5,
    metadata: { chunkingMethod: 'structure-blocks', headingPath: ['Kapitel 1'] },
  }));
}

describe('processDocument', () => {
  const recipe = pointIdRecipeFor('landesverbaende_documents')!;

  it('schreibt zuerst und löscht erst danach', async () => {
    const { deps, log } = fakeDeps(structuredChunks(2));
    const doc = lvDoc({
      pointIds: [
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 0),
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 1),
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 2),
      ],
    });

    const outcome = await processDocument(deps, 'landesverbaende_documents', recipe, doc, RUN);

    // Der Kopf-Punkt trägt full_text und geht allein; danach der Rest; erst
    // dann löschen; erst DANACH der Stempel auf den Kopf.
    const headId = recipe.id('https://www.gruene-bw.de/beschluss.pdf', 0);
    expect(log.calls).toEqual([
      'embed:2',
      'upsert:1',
      'upsert:1',
      'delete:1',
      `setPayload:${headId}`,
    ]);
    expect(log.deleted).toEqual([recipe.id('https://www.gruene-bw.de/beschluss.pdf', 2)]);
    expect(log.payloadSet).toEqual([{ id: headId, payload: { rechunked_at: NOW } }]);
    expect(outcome.written).toBe(2);
    expect(outcome.deleted).toBe(1);
  });

  it('ruft setPayload nie auf, wenn deletePoints wirft', async () => {
    const { deps, log } = fakeDeps(structuredChunks(2));
    const failingDeps: RechunkDeps = {
      ...deps,
      deletePoints: async () => {
        throw new Error('boom');
      },
    };
    const doc = lvDoc({
      pointIds: [
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 0),
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 1),
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 2),
      ],
    });

    await expect(
      processDocument(failingDeps, 'landesverbaende_documents', recipe, doc, RUN)
    ).rejects.toThrow('boom');
    expect(log.calls.some((call) => call.startsWith('setPayload'))).toBe(false);
    expect(log.payloadSet).toEqual([]);
  });

  it('trägt die erreichten Zähler auf den Fehler, wenn setPayload nach Upsert und Löschen wirft', async () => {
    const { deps } = fakeDeps(structuredChunks(2));
    const failingDeps: RechunkDeps = {
      ...deps,
      setPayload: async () => {
        throw new Error('setPayload boom');
      },
    };
    const doc = lvDoc({
      pointIds: [
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 0),
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 1),
        recipe.id('https://www.gruene-bw.de/beschluss.pdf', 2),
      ],
    });

    let caught: unknown;
    try {
      await processDocument(failingDeps, 'landesverbaende_documents', recipe, doc, RUN);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RechunkWriteError);
    const error = caught as RechunkWriteError;
    expect(error.message).toContain('setPayload boom');
    // Upsert (2 Chunks) und das Löschen des einen Leftovers sind schon durch —
    // die alte Fassung hätte hier written: 0, deleted: 0 gemeldet.
    expect(error.written).toBe(2);
    expect(error.deleted).toBe(1);
  });

  it('wirft, wenn embed weniger Vektoren liefert als Chunks — statt vector: undefined zu upserten', async () => {
    const { deps, log } = fakeDeps(structuredChunks(3));
    const shortEmbedDeps: RechunkDeps = {
      ...deps,
      embed: async () => [[0.1]],
    };

    await expect(
      processDocument(shortEmbedDeps, 'landesverbaende_documents', recipe, lvDoc(), RUN)
    ).rejects.toThrow(/embed returned 1 vectors for 3 chunks/);
    expect(log.calls.filter((call) => call.startsWith('upsert'))).toEqual([]);
  });

  it('vergibt die IDs nach dem Rezept der Sammlung, nicht laufend', async () => {
    const { deps, log } = fakeDeps(structuredChunks(3));

    await processDocument(deps, 'landesverbaende_documents', recipe, lvDoc(), RUN);

    expect(log.upserted.map((p) => p.id)).toEqual([
      recipe.id('https://www.gruene-bw.de/beschluss.pdf', 0),
      recipe.id('https://www.gruene-bw.de/beschluss.pdf', 1),
      recipe.id('https://www.gruene-bw.de/beschluss.pdf', 2),
    ]);
  });

  it('löscht nichts, wenn die neue Menge die alte abdeckt', async () => {
    const { deps, log } = fakeDeps(structuredChunks(3));
    const doc = lvDoc({ pointIds: [recipe.id('https://www.gruene-bw.de/beschluss.pdf', 0)] });

    const outcome = await processDocument(deps, 'landesverbaende_documents', recipe, doc, RUN);

    expect(log.calls.filter((c) => c.startsWith('delete'))).toEqual([]);
    expect(outcome.deleted).toBe(0);
    // Ohne Leftover-Löschung stempelt processDocument den Kopf trotzdem.
    expect(log.calls.filter((c) => c.startsWith('setPayload'))).toHaveLength(1);
  });

  it('bettet Titel und Überschriftenpfad vor den Chunk', async () => {
    const { deps, log } = fakeDeps(structuredChunks(1));

    await processDocument(deps, 'landesverbaende_documents', recipe, lvDoc(), RUN);

    expect(log.embedded[0]).toContain('Beschluss Wärmewende');
    expect(log.embedded[0]).toContain('Kapitel 1');
    expect(log.embedded[0]).toContain('Chunk 0');
  });

  it('überspringt ein Dokument ohne full_text — zählt es und holt es nie nach', async () => {
    const { deps, log } = fakeDeps(structuredChunks(3));
    const doc = lvDoc({ headPayload: { ...HEAD_PAYLOAD, full_text: undefined }, pointIds: [1, 2] });

    const outcome = await processDocument(deps, 'landesverbaende_documents', recipe, doc, RUN);

    expect(outcome.skipped).toBe('no_full_text');
    expect(outcome.oldChunks).toBe(2);
    expect(log.calls).toEqual([]);
  });

  it('schreibt im Dry-Run nichts, misst aber die Chunk-Zahl', async () => {
    const { deps, log } = fakeDeps(structuredChunks(5));

    const outcome = await processDocument(deps, 'landesverbaende_documents', recipe, lvDoc(), {
      ...RUN,
      dryRun: true,
    });

    expect(log.calls).toEqual([]);
    expect(outcome.newChunks).toBe(5);
    expect(outcome.structured).toBe(true);
    expect(outcome.written).toBe(0);
  });

  it('überspringt mit --only-structured das Dokument, das auf den Fließtext-Pfad fällt', async () => {
    const prosa: Chunk[] = [
      { text: 'a', index: 0, tokens: 1, metadata: { chunkingMethod: 'sentences' } },
    ];
    const { deps, log } = fakeDeps(prosa);

    const outcome = await processDocument(deps, 'landesverbaende_documents', recipe, lvDoc(), {
      ...RUN,
      onlyStructured: true,
    });

    expect(outcome.skipped).toBe('fast_path');
    expect(log.calls).toEqual([]);
  });

  it('überspringt mit --resume ein Dokument, dessen Kopf rechunked_at trägt', async () => {
    const { deps, log } = fakeDeps(structuredChunks(2));
    const doc = lvDoc({
      headPayload: { ...HEAD_PAYLOAD, full_text: 'x', rechunked_at: '2026-09-02T09:00:00.000Z' },
    });

    const outcome = await processDocument(deps, 'landesverbaende_documents', recipe, doc, {
      ...RUN,
      resume: true,
    });

    expect(outcome.skipped).toBe('already_rechunked');
    expect(log.calls).toEqual([]);
  });
});
