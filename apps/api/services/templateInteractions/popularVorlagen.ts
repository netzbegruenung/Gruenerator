/**
 * „Beliebte Vorlagen" für die Studio-Startseite: der Grünerator-Katalog des
 * Landes, nach Likes geordnet. Community- und Canva-Vorlagen gehören in den
 * Marktplatz, nicht hierher (wie auf `/vorlagen`).
 *
 * Was Likes hat, kommt zuerst (mehr Likes zuerst); Gleichstand und alles ohne
 * Likes bleiben in Katalog-Reihenfolge.
 */
import { type PopularVorlage, type SharepicVorlage } from '@gruenerator/contracts';

import { listSharepicVorlagen } from '../sharepicVorlagen/catalog.js';

import { getTemplateEngagement, getTemplateScores } from './templateEngagement.js';

/** Wie viele bestbewertete ids höchstens betrachtet werden. */
const SCORED_POOL = 200;

export function rankPopular(
  catalog: SharepicVorlage[],
  scores: Map<string, number>,
  limit: number
): SharepicVorlage[] {
  const score = (v: SharepicVorlage) => scores.get(v.id) ?? 0;
  // Array.prototype.sort is stable: ties keep catalogue order.
  return [...catalog].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export async function listPopularVorlagen(
  locale: 'de-DE' | 'de-AT',
  limit: number
): Promise<PopularVorlage[]> {
  const scores = await getTemplateScores(SCORED_POOL);
  const picked = rankPopular(listSharepicVorlagen(locale), scores, limit);
  const likes = new Map(
    (await getTemplateEngagement(picked.map((v) => v.id))).map((e) => [e.id, e.likes_count])
  );
  return picked.map((vorlage) => ({
    kind: 'catalog',
    vorlage,
    likes_count: likes.get(vorlage.id) ?? 0,
  }));
}
