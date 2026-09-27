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

import type { ReferenceData, ReferencesMap } from './types.js';

/**
 * Das Datums-Etikett einer Quelle im Prompt. Eine reine Upload-Zeit heisst
 * "hochgeladen" — als "Datum" las das Modell sie als Beschluss- oder
 * Erscheinungsdatum des Dokuments.
 */
export function sourceDatePart(ref: Pick<ReferenceData, 'date' | 'uploaded_at'>): string {
  const dateLabel = formatDe(ref.date);
  if (dateLabel) return `(Datum: ${dateLabel}) `;
  const uploadLabel = formatDe(ref.uploaded_at);
  return uploadLabel ? `(hochgeladen: ${uploadLabel}) ` : '';
}

export function buildContextSummary(referencesMap: ReferencesMap, now: Date = new Date()): string {
  const today = now.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = Object.keys(referencesMap).map((id) => {
    const ref = referencesMap[id];
    const collectionTag = ref.collection_name ? `[${ref.collection_name}] ` : '';
    return `${id}. ${collectionTag}${sourceDatePart(ref)}${ref.title} — "${sourceTextForPrompt(ref)}"`;
  });
  return `Heutiges Datum: ${today}\n\n${lines.join('\n')}`;
}
