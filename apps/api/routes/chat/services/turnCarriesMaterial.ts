import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * Bringt DIESER Turn Material mit (Anhang, Einfügung, @-Verweis)? Zustand, kein
 * Wort: `turnMaterial` ist die Liste, die diese Nachricht selbst erzeugt hat
 * (`upload`, `paste`, `reference`). `client` (Editor-Kontext) und `sharepic`
 * (Stand des offenen Sharepics) sind Oberflächenkontext, nichts, was die Person
 * mitgeschickt hat. Bewusst enger als `materialReaderTools`: das zählt auch
 * `notebook_quellen` (jeder Notebook-Turn) und die Anhänge früherer Turns — und
 * enger als `wholeDocument`, das für einen kurzen Folgeturn den jüngsten Paste
 * des Gesprächs trägt (`latestPasteOfThread`).
 *
 * Große Anhänge (ab 12k Zeichen) stehen nicht mehr in `turnMaterial`: nach der
 * Vektorisierung ersetzt `replaceFileItems` die Datei-Einträge durch die
 * kleinen (contextEnrichmentService). Sie zeigen sich in `documentChatLabels`,
 * das nur für die in DIESEM Turn indizierten Anhänge gesetzt wird. Ein
 * `wholeDocument` mit `origin: 'turn'` stammt ebenfalls nur aus den Anhängen
 * dieses Turns und deckt den Fall ab, dass die Indizierung scheiterte.
 */
export function turnCarriesMaterial(
  state: Pick<ChatGraphState, 'turnMaterial' | 'documentChatLabels' | 'wholeDocument'>
): boolean {
  return (
    (state.turnMaterial ?? []).some(
      (item) => item.kind === 'upload' || item.kind === 'paste' || item.kind === 'reference'
    ) ||
    Object.keys(state.documentChatLabels ?? {}).length > 0 ||
    state.wholeDocument?.origin === 'turn'
  );
}
