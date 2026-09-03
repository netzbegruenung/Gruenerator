/**
 * Der Einbetter eines Bake-off-Kandidaten — Dokumente und Anfragen.
 *
 * Zwei Dinge macht er, die `mistralEmbeddingService` nicht macht, und beide
 * sind der Grund, warum es diese Datei gibt statt eines Aufrufs von `embedMany`
 * an der Aufrufstelle:
 *
 * 1. ASYMMETRIE. Qwen3-Embedding verlangt eine Aufgabenbeschreibung je ANFRAGE
 *    und ausdrücklich keine an Dokumenten. Wer sie beidseitig oder gar nicht
 *    anlegt, misst nicht das Modell, das die Modellkarte beschreibt. Die
 *    Anleitung sitzt darum in der Registry und wird HIER genau einmal, genau
 *    auf der Query-Seite, angewandt.
 *
 * 2. DIE DIMENSIONSPRÜFUNG. Ein Anbieter, der ein anderes Modell substituiert
 *    (bei Regolo gemessen, siehe CLAUDE.md), liefert Vektoren anderer Länge —
 *    Qdrant nimmt sie beim Upsert nicht an, aber erst nach Hunderten bezahlter
 *    Einbettungen. Jeder Vektor wird deshalb sofort gegen `candidate.dims`
 *    geprüft, mit der tatsächlichen Länge im Fehler.
 *
 * STAPELGRÖSSE 16, nicht die 2048, die `@ai-sdk/openai` als
 * `maxEmbeddingsPerCall` zulässt: die Anfrage trägt ganze Chunk-Texte, und der
 * Reverse-Proxy vor Qdrant hat bei 64 Punkten je Anfrage schon mit 413
 * geantwortet (`scripts/migrate-bm25-sparse.ts`). 16 ist dieselbe Zahl, auf die
 * dort der Schreibpfad gestellt wurde.
 *
 * CORTECS BRAUCHT EINEN EIGENEN CLIENT. `cortecsFetchWithPolicy` (die
 * Produktions-Weisung nach DPA 2.11) prüft `parsed.messages` und lässt einen
 * Einbettungs-Body — der `input` trägt, nicht `messages` — unverändert durch:
 * ohne `eu_native` / `allow_zero_data_retention` / `allowed_providers`. Für den
 * Bake-off wird die Weisung darum hier auf die Einbettungsform angewandt,
 * gegen dieselbe Positivliste und mit derselben Nachprüfung am
 * `x-cortecs-provider`-Header. (Sollten Einbettungen je in Produktion über
 * Cortecs laufen, gehört diese Bedingung in `cortecsRequestPolicy.ts` erweitert
 * — siehe Bericht.)
 */
import { embedMany, type EmbeddingModel } from 'ai';

import { type EmbedCandidate } from './embedCandidates.js';

/** Werte je HTTP-Anfrage. Siehe Kopfkommentar. */
export const EMBED_BATCH_SIZE = 16;

export interface BatchEmbedResult {
  embeddings: number[][];
  /** `usage.tokens` des Stapels, 0 wenn der Anbieter keine nennt. */
  tokens: number;
  /**
   * Der tatsächlich rechnende Unterauftragnehmer — EIN Eintrag je HTTP-Antwort,
   * also je Stapel, nicht je Wert. Leer bei Anbietern, die keine Router sind.
   */
  upstreams: (string | null)[];
}

/** Was ein Stapel tut. Austauschbar, damit der Test ohne Anbieter auskommt. */
export type BatchEmbedder = (values: string[]) => Promise<BatchEmbedResult>;

export interface EmbedderStats {
  batches: number;
  values: number;
  tokens: number;
  /** Wie oft welcher Cortecs-Unterauftragnehmer geantwortet hat. */
  upstreams: Record<string, number>;
}

export interface CandidateEmbedder {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  readonly stats: EmbedderStats;
}

/**
 * Was auf der Anfrage-Seite wirklich eingebettet wird.
 *
 * Das Format ist Qwens dokumentiertes (`Instruct: {task}\nQuery: {query}`);
 * ohne Anleitung bleibt der Text unverändert — kein leeres `Instruct:`-Präfix,
 * das der symmetrischen Kandidaten Eingabe verschieben würde.
 */
export function formatQuery(candidate: EmbedCandidate, text: string): string {
  if (candidate.queryInstruction === null) return text;
  return `Instruct: ${candidate.queryInstruction}\nQuery: ${text}`;
}

/** Zerlegt in Stapel von höchstens `size` Werten. Rein, damit die Aufteilung
 *  prüfbar ist, ohne einen Anbieter zu fahren. */
export function chunkValues(
  values: readonly string[],
  size: number = EMBED_BATCH_SIZE
): string[][] {
  if (size < 1) throw new Error(`chunkValues: size must be >= 1, got ${size}`);
  const out: string[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size) as string[]);
  }
  return out;
}

export function createCandidateEmbedder(
  candidate: EmbedCandidate,
  embedBatch?: BatchEmbedder
): CandidateEmbedder {
  const batch: BatchEmbedder = embedBatch ?? createProviderBatchEmbedder(candidate);
  const stats: EmbedderStats = { batches: 0, values: 0, tokens: 0, upstreams: {} };

  function assertDims(vectors: number[][], expectedCount: number): void {
    if (vectors.length !== expectedCount) {
      throw new Error(
        `${candidate.slug}: provider returned ${vectors.length} vectors for ${expectedCount} values`
      );
    }
    for (let i = 0; i < vectors.length; i++) {
      const length = vectors[i]?.length ?? 0;
      if (length !== candidate.dims) {
        throw new Error(
          `${candidate.slug} (${candidate.model}): expected ${candidate.dims} dimensions, got ${length} (vector ${i})`
        );
      }
    }
  }

  async function run(values: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const slice of chunkValues(values)) {
      const result = await batch(slice);
      assertDims(result.embeddings, slice.length);
      stats.batches += 1;
      stats.values += slice.length;
      stats.tokens += result.tokens;
      for (const upstream of result.upstreams) {
        if (upstream === null) continue;
        stats.upstreams[upstream] = (stats.upstreams[upstream] ?? 0) + 1;
      }
      out.push(...result.embeddings);
    }
    return out;
  }

  return {
    stats,
    async embedDocuments(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      return await run(texts);
    },
    async embedQuery(text: string): Promise<number[]> {
      const [vector] = await run([formatQuery(candidate, text)]);
      if (!vector) throw new Error(`${candidate.slug}: provider returned no query vector`);
      return vector;
    },
  };
}

// ============================================================================
// Anbieter-Seite — alles darunter fasst nur an, wer ohne `embedBatch` aufruft.
// ============================================================================

interface ResolvedModel {
  model: EmbeddingModel;
  /**
   * Der Antwort-Header, der den tatsächlich rechnenden Unterauftragnehmer
   * nennt — `null`, wo es keinen gibt.
   *
   * Nur Cortecs ist ein Router. GreenPT und Regolo rechnen selbst; ihnen den
   * Cortecs-Header-Namen hinzuhalten hiesse, aus jeder Antwort ohne diesen
   * Header eine Aussage über einen Unterauftragnehmer zu machen, den es dort
   * nicht gibt.
   */
  upstreamHeader: string | null;
}

async function resolveEmbeddingModel(candidate: EmbedCandidate): Promise<ResolvedModel> {
  if (candidate.provider === 'cortecs') {
    const { CORTECS_UPSTREAM_HEADER } = await import('../../services/ai/cortecsRequestPolicy.js');
    const provider = await createCortecsEmbeddingProvider();
    return {
      model: provider.embeddingModel(candidate.model),
      upstreamHeader: CORTECS_UPSTREAM_HEADER,
    };
  }
  const { getGreenPTProvider, getRegoloProvider } =
    await import('../../services/ai/providerInstances.js');
  const provider = candidate.provider === 'greenpt' ? getGreenPTProvider() : getRegoloProvider();
  return { model: provider.embeddingModel(candidate.model), upstreamHeader: null };
}

/**
 * Cortecs mit der Souveränitäts-Weisung auf der EINBETTUNGS-Form.
 *
 * Dieselbe Positivliste und dieselbe Nachprüfung wie in der Chat-Lane — nur die
 * Bedingung, wann injiziert wird, unterscheidet sich (`input` statt `messages`).
 */
async function createCortecsEmbeddingProvider() {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const { cortecsBaseUrl } = await import('../../services/ai/cortecsEndpoint.js');
  const { SOVEREIGN_ZDR_PROVIDERS, assertSovereignUpstream } =
    await import('../../services/ai/cortecsRequestPolicy.js');

  const apiKey = process.env.CORTECS_API_KEY;
  if (!apiKey) throw new Error('CORTECS_API_KEY environment variable is required');

  const fetchWithEmbeddingPolicy: typeof fetch = async (input, init) => {
    let request = init;
    if (init?.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        if (parsed.input !== undefined) {
          parsed.eu_native = true;
          parsed.allow_zero_data_retention = true;
          parsed.allowed_providers = SOVEREIGN_ZDR_PROVIDERS;
          request = { ...init, body: JSON.stringify(parsed) };
        }
      } catch {
        // Kein JSON-Body — unverändert durchreichen, wie in der Chat-Lane.
      }
    }
    const response = await fetch(input, request);
    assertSovereignUpstream(response);
    return response;
  };

  return createOpenAI({
    baseURL: cortecsBaseUrl(),
    apiKey,
    name: 'cortecs',
    fetch: fetchWithEmbeddingPolicy,
  });
}

/**
 * Der echte Stapel: ein `embedMany` je Aufruf, Antwort-Header mitgelesen.
 *
 * Das Modell wird beim ersten Stapel aufgelöst, nicht beim Erzeugen — sonst
 * bräuchte schon ein `--help` einen API-Schlüssel.
 */
export function createProviderBatchEmbedder(candidate: EmbedCandidate): BatchEmbedder {
  let resolved: Promise<ResolvedModel> | null = null;

  return async (values: string[]): Promise<BatchEmbedResult> => {
    if (resolved === null) resolved = resolveEmbeddingModel(candidate);
    const { model, upstreamHeader } = await resolved;

    const result = await embedMany({ model, values });
    const upstreams =
      upstreamHeader === null
        ? []
        : (result.responses ?? []).map((response) => {
            const value = response?.headers?.[upstreamHeader];
            return typeof value === 'string' && value.length > 0 ? value : null;
          });

    return {
      embeddings: result.embeddings,
      tokens: result.usage.tokens,
      upstreams,
    };
  };
}
