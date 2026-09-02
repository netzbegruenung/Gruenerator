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
import type { HybridConfig } from './types.js';

const state = vi.hoisted(() => ({ hybrid: {} as Record<string, unknown> }));

vi.mock('../../../../config/vectorConfig.js', () => ({
  vectorConfig: {
    get: (section: string) => (section === 'hybrid' ? state.hybrid : {}),
  },
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
};

function fakeClient() {
  return {
    getCollection: vi.fn().mockResolvedValue({
      config: { params: { sparse_vectors: { bm25: { modifier: 'idf' } } } },
    }),
    query: vi.fn().mockResolvedValue({ points: [] }),
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
async function runArm(client: ReturnType<typeof fakeClient>) {
  return hybridSearch(
    client as unknown as QdrantClient,
    uniqueCollection(),
    QUERY_VECTOR,
    QUERY,
    {},
    {
      limit: 5,
      threshold: 0.35,
      recallLimit: 20,
    }
  );
}

/** Die Gestalt, die an Qdrant ging. */
function sentBody(client: ReturnType<typeof fakeClient>): Record<string, unknown> {
  const call = client.query.mock.calls[0];
  if (!call) throw new Error('client.query wurde gar nicht gerufen');
  return call[1] as Record<string, unknown>;
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

  it('lässt die Sparse-Vorabholung bei Faktor 0 ganz weg', async () => {
    state.hybrid = { ...DEFAULT_HYBRID, serverSparseFactor: 0 };
    const client = fakeClient();
    await runArm(client);

    expect(sentBody(client)).toEqual({
      prefetch: [DENSE_PREFETCH],
      query: { fusion: 'rrf' },
      limit: 20,
      with_payload: true,
    });
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
