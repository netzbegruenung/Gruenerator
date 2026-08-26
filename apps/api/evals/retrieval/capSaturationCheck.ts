/**
 * Bindet der Deckel im Dokument-Scoring — und wie hart?
 *
 *   pnpm --filter @gruenerator/api eval:cap
 *
 * `calculateEnhancedDocumentScore` deckelt bei `SCORING_MAX_FINAL_SCORE`,
 * danach deckelt `calculateHybridDocumentScore` noch einmal bei 1.0. Wo mehrere
 * Dokumente den Deckel erreichen, entscheidet nicht mehr die Bewertung, sondern
 * was danach kommt — die Sättigung, an der der Titel-Entscheider aus #2889
 * hängt.
 *
 * Das Skript braucht keine Instrumentierung: `max_similarity`,
 * `avg_similarity`, `position_score`, `diversity_bonus` und `hybrid_bonus`
 * stehen am Ergebnis, also lässt sich der **ungedeckelte** Wert exakt
 * nachrechnen und gegen den Deckel halten.
 *
 * Gemessen wird über beide Fallmengen (Stichwort und Q&A), denn die Sättigung
 * hängt an der Anfragelänge.
 *
 * Was damit schon gemessen ist (08/2026, #2891): der Deckel bindet — 16,2 %
 * der Stichwort-Plätze, 13,2 % der Q&A-Plätze —, aber ihn aufzuweichen hilft
 * nicht. Eine weiche Sättigung ab 0.9 statt des harten Schnitts liess die
 * Stichwortfälle unverändert und verschlechterte Q&A (Hit@1 53,8 → 51,9 %,
 * MRR 0,670 → 0,661). Wer den Deckel wieder anfassen will, misst zuerst.
 */
import dotenv from 'dotenv';

// Load .env BEFORE the app modules — see runRetrievalEval.ts for why.
dotenv.config();

const { vectorConfig } = await import('../../config/vectorConfig.js');
const { getSearchParams, getSystemCollectionConfig, applyDefaultFilter } =
  await import('../../config/systemCollectionsConfig.js');
const { DocumentSearchService } =
  await import('../../services/document-services/DocumentSearchService/index.js');
const { RETRIEVAL_CASES } = await import('./cases.js');

import type { DocumentResult } from '../../services/BaseSearchService/types.js';

type DocumentSearchService = InstanceType<typeof DocumentSearchService>;

const MANUAL_VECTOR_WEIGHT = 0.7;
const MANUAL_TEXT_WEIGHT = 0.3;
/** Die Plätze, um die es beim Ranking überhaupt geht. */
const TOP_N = 10;
/** Fliesskomma-Toleranz beim Vergleich mit dem Deckel. */
const EPS = 1e-6;

interface CaseStats {
  query: string;
  kind: string;
  atCap: number;
  shown: number;
  /** Grösster ungedeckelter Wert — wie weit über den Deckel hinaus gerechnet wird. */
  maxUncapped: number;
  /** Verschiedene Bewertungen unter den gezeigten Treffern. */
  distinct: number;
}

/**
 * Der ungedeckelte Wert, exakt wie ihn `BaseSearchService/scoring.ts` bildet.
 *
 * Wichtig: **nicht** die gleichnamige Datei unter `DocumentSearchService/`. Die
 * hat eine andere Formel (Qualitätsfaktor statt Positionsgewicht) und wird von
 * der Suche nicht aufgerufen — wer gegen sie rechnet, misst am Ziel vorbei.
 */
function uncappedScore(r: DocumentResult): number {
  const scoring = vectorConfig.get('scoring') as {
    maxSimilarityWeight?: number;
    avgSimilarityWeight?: number;
    positionWeight?: number;
  };

  return (
    r.max_similarity * (scoring.maxSimilarityWeight ?? 0.6) +
    r.avg_similarity * (scoring.avgSimilarityWeight ?? 0.4) +
    (r.position_score ?? 0) * (scoring.positionWeight ?? 0.0) +
    (r.diversity_bonus ?? 0) +
    (r.hybrid_bonus ?? 0)
  );
}

async function main(): Promise<void> {
  const scoring = vectorConfig.get('scoring');
  const innerCap = scoring.maxFinalScore;
  const service = new DocumentSearchService();
  const stats: CaseStats[] = [];

  console.log(`Deckel: innen ${innerCap}, aussen 1.0\n`);

  for (const evalCase of RETRIEVAL_CASES) {
    const config = getSystemCollectionConfig(evalCase.collection);
    if (!config) continue;
    const params = getSearchParams(evalCase.collection);

    const resp = await service.search({
      query: evalCase.query,
      userId: undefined,
      options: {
        limit: params.limit,
        mode: 'hybrid',
        vectorWeight: MANUAL_VECTOR_WEIGHT,
        textWeight: MANUAL_TEXT_WEIGHT,
        threshold: params.threshold,
        searchCollection: config.qdrantCollection,
        recallLimit: params.recallLimit,
        qualityMin: params.qualityMin,
        additionalFilter: applyDefaultFilter(evalCase.collection, undefined),
      },
    } as Parameters<DocumentSearchService['search']>[0]);

    const top = ((resp.results ?? []) as DocumentResult[]).slice(0, TOP_N);
    if (top.length === 0) continue;

    const uncapped = top.map(uncappedScore);
    stats.push({
      query: evalCase.query,
      kind: evalCase.kind ?? 'qa',
      atCap: uncapped.filter((u) => u >= 1.0 - EPS).length,
      shown: top.length,
      maxUncapped: Math.max(...uncapped),
      distinct: new Set(top.map((r) => r.similarity_score.toFixed(4))).size,
    });
  }

  for (const kind of ['manual', 'qa']) {
    const group = stats.filter((s) => s.kind === kind);
    if (group.length === 0) continue;

    const docs = group.reduce((n, s) => n + s.shown, 0);
    const capped = group.reduce((n, s) => n + s.atCap, 0);
    const withTie = group.filter((s) => s.atCap >= 2).length;
    const avgDistinct = group.reduce((n, s) => n + s.distinct / s.shown, 0) / group.length;

    console.log(`── ${kind} (${group.length} Anfragen, ${docs} Dokumente in den Top ${TOP_N}) ──`);
    console.log(`am Deckel:                 ${capped} (${((capped / docs) * 100).toFixed(1)} %)`);
    console.log(
      `Anfragen mit ≥2 am Deckel: ${withTie} (${((withTie / group.length) * 100).toFixed(1)} %)`
    );
    console.log(`verschiedene Werte:        ${(avgDistinct * 100).toFixed(1)} % der Plätze`);

    console.log('härteste Gleichstände:');
    for (const s of [...group].sort((a, b) => b.atCap - a.atCap).slice(0, 6)) {
      console.log(
        `  ${String(s.atCap).padStart(2)}/${s.shown} am Deckel, max ungedeckelt ${s.maxUncapped.toFixed(3)}  „${s.query}"`
      );
    }
    console.log();
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Cap saturation check failed:', error);
  process.exit(1);
});
