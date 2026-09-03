/**
 * ANN-vs-exact recall check (qdrant-search-quality diagnosis pattern):
 * runs every eval query twice against Qdrant — approximate HNSW and
 * exact=true — and reports the overlap as recall@k. Separates "the HNSW
 * index misses points" (tune ef/m) from "the embedding/pipeline is wrong"
 * (which the main eval measures). Target: >95% recall@k.
 *
 *   pnpm --filter @gruenerator/api eval:retrieval:ann
 *
 * Env:
 *   EVAL_EMBED_CANDIDATE  Slug aus `embedCandidates.ts` — prüft dieselbe Frage
 *                    gegen die Wegwerf-Sammlung eines Bake-off-Kandidaten
 *                    (`eval_embed_<slug>__<quelle>`, gebaut von
 *                    `eval:retrieval:embed:build`), mit dessen Anfrage-
 *                    Einbettung. Nötig, weil eine frisch angelegte Sammlung
 *                    ihren HNSW-Index erst noch bauen muss: eine Kandidatenzahl
 *                    aus dem Hauptlauf ist ohne diese Prüfung nicht von einem
 *                    halb indizierten Index zu unterscheiden.
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules (static imports would be hoisted above it).
dotenv.config();

const { env } = await import('../../config/env.js');
const { getSystemCollectionConfig } = await import('../../config/systemCollectionsConfig.js');
const { createQdrantClient } = await import('../../database/services/QdrantService/connection.js');
const { mistralEmbeddingService } = await import('../../services/mistral/index.js');
const { RETRIEVAL_CASES } = await import('./cases.js');
const { resolveEvalCandidate, resolveEvalTarget } = await import('./embedCandidates.js');
const { createCandidateEmbedder } = await import('./candidateEmbedder.js');

const K = 10;

async function main() {
  const client = createQdrantClient({
    url: env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: env.QDRANT_API_KEY ?? '',
    ...(env.QDRANT_BASIC_AUTH_USERNAME && { basicAuthUsername: env.QDRANT_BASIC_AUTH_USERNAME }),
    ...(env.QDRANT_BASIC_AUTH_PASSWORD && { basicAuthPassword: env.QDRANT_BASIC_AUTH_PASSWORD }),
  });

  // Wirft bei unbekanntem Slug, statt still gegen die Produktion zu messen.
  const candidate = resolveEvalCandidate(process.env);
  const embedder = candidate ? createCandidateEmbedder(candidate) : null;
  if (candidate) {
    console.log(
      `Embedding candidate: ${candidate.slug} (${candidate.provider}, ${candidate.model}, ${candidate.dims} dims)`
    );
  } else {
    // Nur der Produktionsarm braucht Mistral; ein Kandidatenlauf soll ohne
    // MISTRAL_API_KEY durchgehen.
    await mistralEmbeddingService.init();
  }

  const perCollection = new Map<string, { overlap: number; total: number }>();
  /**
   * Wegwerf-Sammlungen, die es nicht gibt.
   *
   * Ein Kandidat wird oft nur gegen einen Teil der Sammlungen gebaut. Ohne
   * diesen Zweig bräche der erste solche Fall den ganzen Lauf ab, und die
   * Tabelle für die tatsächlich gebauten Sammlungen — die eigentliche Auskunft
   * darüber, ob deren HNSW-Index schon steht — käme nie zustande.
   */
  const notBuilt = new Set<string>();

  for (const evalCase of RETRIEVAL_CASES) {
    const config = getSystemCollectionConfig(evalCase.collection);
    if (!config) continue;

    const target = resolveEvalTarget(process.env, config.qdrantCollection);
    // Vor dem Einbetten prüfen: eine fehlende Sammlung soll nicht 52-mal
    // bezahlt werden.
    if (notBuilt.has(target.collection)) continue;

    const vector = embedder
      ? await embedder.embedQuery(evalCase.query)
      : await mistralEmbeddingService.generateEmbedding(evalCase.query);

    let approx;
    let exact;
    try {
      [approx, exact] = await Promise.all([
        client.query(target.collection, { query: vector, limit: K, with_payload: false }),
        client.query(target.collection, {
          query: vector,
          limit: K,
          with_payload: false,
          params: { exact: true },
        }),
      ]);
    } catch (error) {
      // Nur im Kandidatenarm nachsichtig: im Produktionsarm IST eine fehlende
      // Sammlung der Befund und darf nicht als Zeile durchgehen.
      if (!candidate) throw error;
      notBuilt.add(target.collection);
      console.warn(
        `  ${target.collection}: not built — ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    const exactIds = new Set(exact.points.map((p) => String(p.id)));
    const overlap = approx.points.filter((p) => exactIds.has(String(p.id))).length;

    const stats = perCollection.get(target.collection) ?? { overlap: 0, total: 0 };
    stats.overlap += overlap;
    stats.total += exactIds.size;
    perCollection.set(target.collection, stats);
  }

  console.log(`── ANN recall@${K} (approximate vs exact) ──`);
  let sumOverlap = 0;
  let sumTotal = 0;
  for (const [collection, { overlap, total }] of perCollection) {
    sumOverlap += overlap;
    sumTotal += total;
    console.log(`${collection.padEnd(32)} ${((100 * overlap) / Math.max(1, total)).toFixed(1)}%`);
  }
  for (const collection of notBuilt) {
    console.log(`${collection.padEnd(32)} not built`);
  }
  const overallPct = (100 * sumOverlap) / Math.max(1, sumTotal);
  console.log(`${'GESAMT'.padEnd(32)} ${overallPct.toFixed(1)}%`);
  if (notBuilt.size > 0) {
    console.log(
      `\n${notBuilt.size} Sammlung(en) nicht gebaut — GESAMT deckt sie nicht ab. ` +
        `Mit eval:retrieval:embed:build nachbauen, sonst misst der Hauptlauf dort ins Leere.`
    );
  }
  if (overallPct < 95) {
    console.log('\nUnter 95% — HNSW-Tuning prüfen (hnsw_ef erhöhen, ggf. ef_construct/m).');
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('ANN recall check failed:', error);
  process.exit(1);
});
