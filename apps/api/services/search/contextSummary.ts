/**
 * Der Quellenblock, den das Notebook-Modell liest: heutiges Datum voran, dann
 * je Referenz Nummer, Sammlung, Quellendatum, Titel und Text.
 *
 * Eine Funktion für beide Aufrufer. Vorher baute `_buildStreamingContext` den
 * Block mit Datum und `rerankNotebookResults` einen zweiten ohne — und der
 * zweite ersetzte den ersten in jeder Stufe (#3124), während der Prompt
 * weiter verlangte, neuere Quellen zu bevorzugen.
 */
import { formatDe } from './recency.js';
import { sourceTextForPrompt } from './SearchResultProcessor.js';

import type { ReferencesMap } from './types.js';

export function buildContextSummary(referencesMap: ReferencesMap, now: Date = new Date()): string {
  const today = now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = Object.keys(referencesMap).map((id) => {
    const ref = referencesMap[id];
    const collectionTag = ref.collection_name ? `[${ref.collection_name}] ` : '';
    const dateLabel = formatDe(ref.date);
    const datePart = dateLabel ? `(Datum: ${dateLabel}) ` : '';
    return `${id}. ${collectionTag}${datePart}${ref.title} — "${sourceTextForPrompt(ref)}"`;
  });
  return `Heutiges Datum: ${today}\n\n${lines.join('\n')}`;
}
