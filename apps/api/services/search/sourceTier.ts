/**
 * Quellen-Ampel der Parlaments-Notebooks (#4307): bei `documents-first` rücken
 * Plenar- und Ausschussprotokolle um einen kleinen Abschlag hinter
 * Drucksachen. Gemessen auf 300 erzeugten Fragen, nur dichte Spur: bei 0,005
 * steigen die Dokumentfragen in NRW von 44 auf 46 von 50, die Debattenfragen
 * bleiben in NRW und im Bundestag gleich (40 und 43 von 50) und fallen in Berlin
 * von 36 auf 35. Größere Abschläge entfernen die Protokolle faktisch, weil dichte
 * Werte eng beieinander liegen (die ersten 15 innerhalb von 0,024) — deshalb ein
 * Abschlag und keine Quote oder Sperre.
 */

import { type NotebookSourceTier } from '@gruenerator/contracts';

import { getSystemCollectionConfig } from '../../config/systemCollectionsConfig.js';

import { type SearchResultInput } from './types.js';

export const SOURCE_TIER_PENALTY = 0.005;

/**
 * Zieht den Abschlag von Ähnlichkeit und Dense-Ähnlichkeit ab, damit Schwelle
 * (`dense_similarity ?? similarity`) und Sortierung ihn beide sehen. Ohne Stufe,
 * ohne `demotedContentTypes` an der Sammlung oder ohne passenden Treffer bleibt
 * alles, wie es ist.
 */
export function applySourceTier<T extends SearchResultInput>(
  results: readonly T[],
  collectionId: string,
  tier: NotebookSourceTier | undefined
): T[] {
  const demoted = getSystemCollectionConfig(collectionId)?.demotedContentTypes;
  if (tier !== 'documents-first' || !demoted?.length) return [...results];
  return results.map((r) => {
    const contentType = r.top_chunks?.[0]?.content_type;
    if (!contentType || !demoted.includes(contentType)) return r;
    return {
      ...r,
      similarity_score: Math.max(0, (r.similarity_score ?? 0) - SOURCE_TIER_PENALTY),
      dense_similarity_score:
        typeof r.dense_similarity_score === 'number'
          ? Math.max(0, r.dense_similarity_score - SOURCE_TIER_PENALTY)
          : r.dense_similarity_score,
    };
  });
}
