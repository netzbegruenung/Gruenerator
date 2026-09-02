/**
 * Prüfmittel der Tuning-Arme des server-seitigen Hybrid-Pfads (#3118).
 *
 * Gegenstand jeder Zusicherung ist die GESTALT der Anfrage, die an den Client
 * geht — nicht die Antwort und nicht die Aufrufzahl. Der Grund steht im Kopf
 * von `hybridSearchServerSide.vitest.ts` (:44–46): der Alt-Pfad ruft
 * `client.query` ebenfalls (dichte Suche), „kein query-Aufruf" beweist hier
 * also nichts.
 *
 * `vectorConfig` ist eine REINE Attrappe ohne `importOriginal`: das Modul wird
 * von `hybridSearch.ts:9` und `vectorSearch.ts:8` statisch importiert, und eine
 * Fabrik mit `importOriginal` zöge unter Last den echten Konfigurationsgraphen
 * auf die Uhr des ersten Tests. Zwei Abschnitte reichen: `hybrid` liest
 * `hybridSearch.ts:40`, `quality` liest `vectorSearch.ts:124`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hybridSearch } from './hybridSearch.js';

import type { QdrantClient } from '@qdrant/js-client-rest';
import type { HybridConfig, QdrantFilter } from './types.js';

const state = vi.hoisted(() => ({ hybrid: {} as Record<string, unknown> }));
const loggerState = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../../config/vectorConfig.js', () => ({
  vectorConfig: {
    get: (section: string) => (section === 'hybrid' ? state.hybrid : {}),
  },
}));

// Spy on the coverage log line (Fix-Runde 1, finding 2): `createLogger` is
// called once at module load, so the mock must hand back the SAME object on
// every call for the test to observe what `hybridSearch.ts` logged.
vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => loggerState,
}));

/**
 * Das Qualitäts-Gatter und die dynamischen Schwellen bleiben in allen Armen
 * AUS: sie ändern die Antwortliste, nicht die gesendete Anfrage, und die
 * Antwortliste ist hier nicht der Gegenstand.
 */
const DEFAULT_HYBRID: HybridConfig = {
  enableDynamicThresholds: false,
  minVectorWithTextThreshold: 0.35,
  minVectorOnlyThreshold: 0.55,
  enableQualityGate: false,
  minFinalScore: 0.008,
  minVectorOnlyFinalScore: 0.01,
  enableConfidenceWeighting: false,
  confidencePenalty: 0.7,
  confidenceBoost: 1.2,
  serverSideEnabled: true,
  serverFusion: 'rrf',
  serverSparseFactor: 1.0,
  serverRrfWeightDense: 0.7,
  serverScoreJoin: true,
};

function fakeClient() {
  return {
    getCollection: vi.fn().mockResolvedValue({
      config: { params: { sparse_vectors: { bm25: { modifier: 'idf' } } } },
    }),
    query: vi.fn().mockResolvedValue({ points: [] }),
    // Mit HYBRID_SERVER_SCORE_JOIN (Default an) geht die Fusionsabfrage als
    // `searches[0]` eines Batch hinaus; Eintrag 2 und 3 sind die Spiegelsuchen.
    queryBatch: vi.fn().mockResolvedValue([{ points: [] }, { points: [] }, { points: [] }]),
    scroll: vi.fn().mockResolvedValue({ points: [] }),
    search: vi.fn().mockResolvedValue([]),
  };
}

// `collectionSupportsBm25` cacht je Sammlungsnamen prozessweit — jeder Test
// braucht einen eigenen Namen, sonst misst der zweite den Cache des ersten.
let counter = 0;
const uniqueCollection = (): string => `arm_collection_${counter++}`;

const QUERY_VECTOR = [0.1, 0.2];
const QUERY = 'Klimaschutz Wahlprogramm';

/**
 * limit 5, recallLimit 20 → recall = max(5, 20) = 20 (`hybridSearch.ts:204`),
 * hnsw_ef = max(100, 40) = 100 (`:214`). Beide Zahlen stehen unten als
 * Literale in den Zusicherungen, damit eine Änderung an der Recall-Formel
 * hier auffällt und nicht stillschweigend mitwandert.
 */
async function runArm(client: ReturnType<typeof fakeClient>, filter: QdrantFilter = {}) {
  return hybridSearch(
    client as unknown as QdrantClient,
    uniqueCollection(),
    QUERY_VECTOR,
    QUERY,
    filter,
    {
      limit: 5,
      threshold: 0.35,
      recallLimit: 20,
    }
  );
}

/** Die Fusionsgestalt, die an Qdrant ging — durch welche Tür auch immer. */
function sentBody(client: ReturnType<typeof fakeClient>): Record<string, unknown> {
  const batch = client.queryBatch.mock.calls[0];
  if (batch) {
    const searches = (batch[1] as { searches: Record<string, unknown>[] }).searches;
    const first = searches[0];
    if (!first) throw new Error('queryBatch ging ohne einen einzigen search hinaus');
    return first;
  }
  const call = client.query.mock.calls[0];
  if (!call) throw new Error('weder client.query noch client.queryBatch wurde gerufen');
  return call[1] as Record<string, unknown>;
}

/** Alle searches des Batch, in Reihenfolge. Wirft, wenn kein Batch hinausging. */
function sentSearches(client: ReturnType<typeof fakeClient>): Record<string, unknown>[] {
  const batch = client.queryBatch.mock.calls[0];
  if (!batch) throw new Error('client.queryBatch wurde gar nicht gerufen');
  return (batch[1] as { searches: Record<string, unknown>[] }).searches;
}

/**
 * Antwortpunkte auf BEIDE Türen legen. Welche der Arm nimmt, entscheidet der
 * Join-Schalter — eine Zusicherung über die Ergebnisliste soll davon nicht
 * abhängen.
 */
function respondWith(
  client: ReturnType<typeof fakeClient>,
  points: Array<{ id: number; score: number; payload: Record<string, unknown> }>,
  dense: Array<{ id: number; score: number }> = [],
  sparse: Array<{ id: number; score: number }> = []
): void {
  client.query.mockResolvedValue({ points });
  client.queryBatch.mockResolvedValue([{ points }, { points: dense }, { points: sparse }]);
}

const DENSE_PREFETCH = {
  query: QUERY_VECTOR,
  using: '',
  limit: 20,
  score_threshold: 0.35,
  params: { hnsw_ef: 100 },
};

const SPARSE_PREFETCH = (limit: number) => ({
  query: { indices: expect.any(Array), values: expect.any(Array) },
  using: 'bm25',
  limit,
});

/** A non-empty filter, to pin where each arm attaches it (finding 2). */
const TEST_FILTER: QdrantFilter = { must: [{ key: 'x', match: { value: 'y' } }] };

beforeEach(() => {
  vi.clearAllMocks();
  state.hybrid = { ...DEFAULT_HYBRID };
});

describe('HYBRID_SERVER_SIDE_ENABLED', () => {
  it('fährt den Server-Pfad, solange der Schalter an ist', async () => {
    const client = fakeClient();
    const response = await runArm(client);

    expect(response.metadata.fusionMethod).toBe('rrf-server');
    expect(client.getCollection).toHaveBeenCalledTimes(1);
  });

  it('schickt bei false alles auf die Alt-Fusion — ohne getCollection zu rufen', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverSideEnabled: false };
    const client = fakeClient();
    const response = await runArm(client);

    // Die Kurzschluss-Reihenfolge ist Absicht: bei `false` fällt auch der
    // getCollection-Rundlauf weg. Das ist hier die schärfere Zusicherung —
    // der Alt-Pfad ruft `client.query` für die dichte Suche selbst.
    expect(client.getCollection).not.toHaveBeenCalled();
    expect(['RRF', 'weighted']).toContain(response.metadata.fusionMethod);
  });
});

describe('rangbasierte Arme', () => {
  it('rrf: dichte + sparse Vorabholung, Fusion rrf', async () => {
    const client = fakeClient();
    const response = await runArm(client);

    expect(sentBody(client)).toEqual({
      prefetch: [DENSE_PREFETCH, SPARSE_PREFETCH(20)],
      query: { fusion: 'rrf' },
      limit: 20,
      with_payload: true,
    });
    expect(response.metadata.fusionMethod).toBe('rrf-server');
  });

  it('rrf: ein Filter landet in BEIDEN Vorabholungen, nicht auf der Anfrage', async () => {
    const client = fakeClient();
    await runArm(client, TEST_FILTER);

    expect(sentBody(client)).toEqual({
      prefetch: [
        { ...DENSE_PREFETCH, filter: TEST_FILTER },
        { ...SPARSE_PREFETCH(20), filter: TEST_FILTER },
      ],
      query: { fusion: 'rrf' },
      limit: 20,
      with_payload: true,
    });
  });

  it('dbsf: gleiche Vorabholungen, andere Fusion', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'dbsf' };
    const client = fakeClient();
    const response = await runArm(client);

    expect(sentBody(client)).toEqual({
      prefetch: [DENSE_PREFETCH, SPARSE_PREFETCH(20)],
      query: { fusion: 'dbsf' },
      limit: 20,
      with_payload: true,
    });
    expect(response.metadata.fusionMethod).toBe('dbsf-server');
  });

  it('rrf_weighted: RrfQuery mit einem Gewicht je Vorabholung, in derselben Reihenfolge', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'rrf_weighted', serverRrfWeightDense: 0.7 };
    const client = fakeClient();
    const response = await runArm(client);

    const body = sentBody(client);
    expect(Object.keys(body).sort()).toEqual(['limit', 'prefetch', 'query', 'with_payload']);
    expect(body.prefetch).toEqual([DENSE_PREFETCH, SPARSE_PREFETCH(20)]);
    expect(body.limit).toBe(20);
    expect(body.with_payload).toBe(true);
    // Kein exaktes toEqual auf die Gewichte: 1 − 0,7 ist in IEEE-754
    // 0.30000000000000004, und diese Ziffernfolge ist keine Zusicherung wert.
    const weights = (body.query as { rrf: { weights: number[] } }).rrf.weights;
    expect(weights).toHaveLength(2);
    expect(weights[0]).toBeCloseTo(0.7, 6);
    expect(weights[1]).toBeCloseTo(0.3, 6);
    expect(response.metadata.fusionMethod).toBe('rrf_weighted-server');
    // Die Metadaten sollen den Arm nicht anlügen: 0,5/0,5 wäre hier falsch.
    expect(response.metadata.vectorWeight).toBeCloseTo(0.7, 6);
    expect(response.metadata.textWeight).toBeCloseTo(0.3, 6);
  });

  it('rrf_weighted mit umgekehrtem Gewicht dreht nur die Zahlen, nicht die Gestalt', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'rrf_weighted', serverRrfWeightDense: 0.25 };
    const client = fakeClient();
    await runArm(client);

    const weights = (sentBody(client).query as { rrf: { weights: number[] } }).rrf.weights;
    expect(weights[0]).toBeCloseTo(0.25, 6);
    expect(weights[1]).toBeCloseTo(0.75, 6);
  });
});

describe('dense_rescore', () => {
  it('verschachtelt die Fusion und sortiert aussen mit dem dichten Vektor', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'dense_rescore' };
    const client = fakeClient();
    const response = await runArm(client);

    // BM25 stellt die Kandidaten, der dichte Vektor bestimmt die Rangfolge —
    // und damit ist der zurückgegebene score wieder ein Kosinus, die Domäne,
    // in der 0,35 / 0,55 / 0,12 geschrieben sind.
    expect(sentBody(client)).toEqual({
      prefetch: [
        {
          prefetch: [DENSE_PREFETCH, SPARSE_PREFETCH(20)],
          query: { fusion: 'rrf' },
          limit: 20,
        },
      ],
      query: QUERY_VECTOR,
      using: '',
      limit: 20,
      with_payload: true,
    });
    expect(response.metadata.fusionMethod).toBe('dense_rescore-server');
  });

  it('legt der äusseren Abfrage weder Schwelle noch params bei', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'dense_rescore' };
    const client = fakeClient();
    await runArm(client);

    const body = sentBody(client);
    expect(body).not.toHaveProperty('score_threshold');
    expect(body).not.toHaveProperty('params');
  });

  it('ein Filter landet in den INNEREN Vorabholungen, nicht auf der äusseren Abfrage', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'dense_rescore' };
    const client = fakeClient();
    await runArm(client, TEST_FILTER);

    expect(sentBody(client)).toEqual({
      prefetch: [
        {
          prefetch: [
            { ...DENSE_PREFETCH, filter: TEST_FILTER },
            { ...SPARSE_PREFETCH(20), filter: TEST_FILTER },
          ],
          query: { fusion: 'rrf' },
          limit: 20,
        },
      ],
      query: QUERY_VECTOR,
      using: '',
      limit: 20,
      with_payload: true,
    });
  });
});

describe('sparse_only', () => {
  it('fragt die BM25-Lane direkt ab, ohne prefetch und ohne Fusion', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'sparse_only' };
    const client = fakeClient();
    const response = await runArm(client);

    expect(sentBody(client)).toEqual({
      query: { indices: expect.any(Array), values: expect.any(Array) },
      using: 'bm25',
      limit: 20,
      with_payload: true,
    });
    expect(response.metadata.fusionMethod).toBe('sparse_only-server');
  });

  it('ein Filter landet auf der Anfrage selbst, nicht in einer Vorabholung', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'sparse_only' };
    const client = fakeClient();
    await runArm(client, TEST_FILTER);

    expect(sentBody(client)).toEqual({
      query: { indices: expect.any(Array), values: expect.any(Array) },
      using: 'bm25',
      limit: 20,
      with_payload: true,
      filter: TEST_FILTER,
    });
  });
});

describe('HYBRID_SERVER_SPARSE_FACTOR', () => {
  it('fächert die Sparse-Vorabholung auf, ohne die dichte anzufassen', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverSparseFactor: 3 };
    const client = fakeClient();
    await runArm(client);

    expect(sentBody(client)).toEqual({
      prefetch: [DENSE_PREFETCH, SPARSE_PREFETCH(60)],
      query: { fusion: 'rrf' },
      limit: 20,
      with_payload: true,
    });
  });

  it('lässt die Sparse-Vorabholung bei Faktor 0 ganz weg und meldet keine BM25-Lane', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverSparseFactor: 0 };
    const client = fakeClient();
    const response = await runArm(client);

    expect(sentBody(client)).toEqual({
      prefetch: [DENSE_PREFETCH],
      query: { fusion: 'rrf' },
      limit: 20,
      with_payload: true,
    });
    // Reines dichtes Prefetch — die Metadaten dürfen keine BM25-Lane behaupten,
    // die es nie gab.
    expect(response.metadata.hasRealTextMatches).toBe(false);
    expect(response.metadata.textMatchTypes).toEqual([]);
  });

  it('kürzt bei rrf_weighted die Gewichte mit der Liste, nicht daneben', async () => {
    state.hybrid = {
      ...DEFAULT_HYBRID,
      serverFusion: 'rrf_weighted',
      serverSparseFactor: 0,
      serverRrfWeightDense: 0.7,
    };
    const client = fakeClient();
    await runArm(client);

    const body = sentBody(client);
    expect(body.prefetch).toHaveLength(1);
    // Ein Gewicht je Vorabholung — sonst lehnt der Server die Anfrage ab
    // ("The number of weights should match the number of prefetches").
    expect((body.query as { rrf: { weights: number[] } }).rrf.weights).toHaveLength(1);
  });

  it('ist der dicht-nur-Kontrollarm, wenn dense_rescore dazukommt', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'dense_rescore', serverSparseFactor: 0 };
    const client = fakeClient();
    await runArm(client);

    expect(sentBody(client)).toEqual({
      prefetch: [{ prefetch: [DENSE_PREFETCH], query: { fusion: 'rrf' }, limit: 20 }],
      query: QUERY_VECTOR,
      using: '',
      limit: 20,
      with_payload: true,
    });
  });

  it('fällt bei sparse_only + Faktor 0 auf die Alt-Fusion zurück, statt nichts zu fragen', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'sparse_only', serverSparseFactor: 0 };
    const client = fakeClient();
    const response = await runArm(client);

    expect(['RRF', 'weighted']).toContain(response.metadata.fusionMethod);
  });
});

describe('Qualitäts-Gatter auf dem Server-Pfad', () => {
  const lowScoringPoints = [
    { id: 1, score: 0.9, payload: { chunk_text: 'a' } },
    { id: 2, score: 0.001, payload: { chunk_text: 'b' } },
  ];

  it('filtert bei rrf — dem ausgelieferten Arm — mit eingeschaltetem Gatter', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, enableQualityGate: true };
    const client = fakeClient();
    respondWith(client, lowScoringPoints);
    const response = await runArm(client);
    expect(response.results.map((r) => r.id)).toEqual([1]);
  });

  it('lässt dbsf und sparse_only ungefiltert, weil das Gatter dort nie gemessen wurde', async () => {
    for (const serverFusion of ['dbsf', 'sparse_only'] as const) {
      state.hybrid = { ...DEFAULT_HYBRID, enableQualityGate: true, serverFusion };
      const client = fakeClient();
      respondWith(client, lowScoringPoints);
      const response = await runArm(client);
      expect(response.results.map((r) => r.id)).toEqual([1, 2]);
    }
  });
});

describe('HYBRID_SERVER_SCORE_JOIN', () => {
  const FUSION_POINTS = [
    { id: 1, score: 0.9, payload: { chunk_text: 'beide Lanes' } },
    { id: 2, score: 0.8, payload: { chunk_text: 'nur sparse' } },
    { id: 3, score: 0.7, payload: { chunk_text: 'nur Fusion' } },
  ];

  it('schickt drei Suchen in EINEM queryBatch, kein zweites query', async () => {
    const client = fakeClient();
    await runArm(client);

    expect(client.queryBatch).toHaveBeenCalledTimes(1);
    expect(client.query).not.toHaveBeenCalled();
    expect(sentSearches(client)).toHaveLength(3);
  });

  it('spiegelt die dichte Vorabholung Parameter für Parameter', async () => {
    // Daran hängt die ganze Deckungsgrad-Aussage: nur wenn Suche 2 dieselbe
    // Kandidatenmenge zieht wie die Vorabholung, ist ein Fusionstreffer ohne
    // Eintrag eine Aussage und kein Messfehler.
    const client = fakeClient();
    await runArm(client, TEST_FILTER);

    const [fusion, dense] = sentSearches(client);
    const densePrefetch = (fusion as { prefetch: Record<string, unknown>[] }).prefetch[0];

    expect(dense).toEqual({ ...densePrefetch, with_payload: false });
    expect(dense).toEqual({
      ...DENSE_PREFETCH,
      filter: TEST_FILTER,
      with_payload: false,
    });
  });

  it('spiegelt die sparse Vorabholung Parameter für Parameter', async () => {
    const client = fakeClient();
    await runArm(client, TEST_FILTER);

    const [fusion, , sparse] = sentSearches(client);
    const sparsePrefetch = (fusion as { prefetch: Record<string, unknown>[] }).prefetch[1];

    expect(sparse).toEqual({ ...sparsePrefetch, with_payload: false });
  });

  it('verbindet über die Punkt-ID; wer nicht in der dichten Menge war, bekommt null', async () => {
    const client = fakeClient();
    respondWith(
      client,
      FUSION_POINTS,
      [{ id: 1, score: 0.62 }],
      [
        { id: 1, score: 4.1 },
        { id: 2, score: 3.3 },
      ]
    );
    const response = await runArm(client);

    const byId = new Map(response.results.map((r) => [r.id, r]));
    expect(byId.get(1)?.originalVectorScore).toBeCloseTo(0.62, 6);
    expect(byId.get(1)?.originalTextScore).toBeCloseTo(4.1, 6);
    expect(byId.get(2)?.originalVectorScore).toBeNull();
    expect(byId.get(2)?.originalTextScore).toBeCloseTo(3.3, 6);
    expect(byId.get(3)?.originalVectorScore).toBeNull();
    expect(byId.get(3)?.originalTextScore).toBeNull();
  });

  it('lässt bei Sparse-Faktor 0 die dritte Suche weg, statt eine leere zu schicken', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverSparseFactor: 0 };
    const client = fakeClient();
    await runArm(client);

    expect(sentSearches(client)).toHaveLength(2);
    // Kein Spiegel geht raus, also darf die Deckungszeile nicht "sparse join
    // 0/N" lesen — das läse sich wie "kein Treffer im Join getroffen" statt
    // "kein Join verschickt".
    const [logLine] = loggerState.info.mock.calls[0] as [string];
    expect(logLine).toContain('sparse join skipped');
    expect(logLine).not.toContain('sparse join 0/');
  });

  it('ist bei false byte-gleich zum Zustand vor #3166', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverScoreJoin: false };
    const client = fakeClient();
    respondWith(client, FUSION_POINTS, [{ id: 1, score: 0.62 }], [{ id: 1, score: 4.1 }]);
    const response = await runArm(client);

    expect(client.queryBatch).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
    for (const result of response.results) {
      expect(result.originalVectorScore).toBeNull();
      expect(result.originalTextScore).toBeNull();
    }
  });

  it('löst bei dense_rescore keinen Batch aus und nimmt den äusseren score als Kosinus', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'dense_rescore' };
    const client = fakeClient();
    respondWith(client, FUSION_POINTS);
    const response = await runArm(client);

    expect(client.queryBatch).not.toHaveBeenCalled();
    expect(response.results[0]?.originalVectorScore).toBeCloseTo(0.9, 6);
    expect(response.results[0]?.originalTextScore).toBeNull();
  });

  it('löst bei sparse_only keinen Batch aus und nimmt den score als BM25-Wert', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverFusion: 'sparse_only' };
    const client = fakeClient();
    respondWith(client, FUSION_POINTS);
    const response = await runArm(client);

    expect(client.queryBatch).not.toHaveBeenCalled();
    expect(response.results[0]?.originalTextScore).toBeCloseTo(0.9, 6);
    expect(response.results[0]?.originalVectorScore).toBeNull();
  });

  it('meldet hasRealTextMatches erst, wenn die BM25-Lane wirklich getroffen hat', async () => {
    const client = fakeClient();
    respondWith(client, FUSION_POINTS, [{ id: 1, score: 0.62 }], []);
    const response = await runArm(client);

    expect(response.metadata.hasRealTextMatches).toBe(false);
    // Welcher Matcher in der Lane läuft, ist eine Eigenschaft der Lane und
    // ändert sich nicht dadurch, dass sie diesmal nichts gefunden hat.
    expect(response.metadata.textMatchTypes).toEqual(['bm25']);
  });

  it('meldet hasRealTextMatches, sobald ein sparse Treffer dabei ist', async () => {
    const client = fakeClient();
    respondWith(client, FUSION_POINTS, [], [{ id: 2, score: 3.3 }]);
    const response = await runArm(client);

    expect(response.metadata.hasRealTextMatches).toBe(true);
  });

  it('bleibt ohne Join bei "Lane vorhanden" — mehr weiss der Pfad dort nicht', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverScoreJoin: false };
    const client = fakeClient();
    respondWith(client, FUSION_POINTS);
    const response = await runArm(client);

    expect(response.metadata.hasRealTextMatches).toBe(true);
  });
});
