/**
 * Quellen-Ampel der Parlaments-Notebooks (#4307): Drucksachen vor Protokollen.
 *
 * Welche Sammlungen eine Stufe kennen, entscheidet der Server
 * (`demotedContentTypes` in `systemCollectionsConfig.ts`); für alle anderen ist
 * das Feld wirkungslos. Die UI bietet den Schalter deshalb nur bei den
 * Notebooks an, die dort stehen. Die Ids sind eingefroren (F1).
 */
import { type NotebookSourceTier } from '@gruenerator/contracts';

export const DEFAULT_NOTEBOOK_SOURCE_TIER: NotebookSourceTier = 'equal';

const SOURCE_TIER_NOTEBOOKS: ReadonlySet<string> = new Set([
  'landtag-nrw-system',
  'landtag-berlin-system',
]);

export function supportsSourceTier(collectionIds: readonly string[]): boolean {
  return collectionIds.some((id) => SOURCE_TIER_NOTEBOOKS.has(id));
}

export const SOURCE_TIER_LABEL = 'Drucksachen bevorzugt';
export const SOURCE_TIER_DESCRIPTION =
  'Protokolle von Plenum und Ausschüssen rücken bei gleicher Passung leicht hinter Drucksachen. Nichts wird ausgeschlossen.';
