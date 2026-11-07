/**
 * Das Material eines Turns als Liste — und die einzige Stelle, die daraus den
 * Prompt-Text `attachmentContext` macht (#5430).
 *
 * Bis hierher reiste das Material nur als fertig gerenderter Markdown-Text, und
 * jeder, der wissen musste, WAS ein Abschnitt ist, zerlegte ihn wieder: an
 * `### `-Zeilen (#5429), an `---`, an Überschriften-Endungen (#5432). Jetzt
 * schreiben die Erzeuger Einträge; der Text entsteht daraus, und zwar Byte für
 * Byte so, wie ihn die Erzeuger vorher von Hand zusammengesetzt haben — die
 * Prompt-Goldens bewachen das.
 *
 * Wer `attachmentContext` direkt zuweist, bricht die Kopplung: Liste und Text
 * erzählen dann Verschiedenes. `materialItems.vitest.ts` liest dafür den
 * Quelltext.
 */

import type {
  ChatGraphState,
  TurnMaterialItem,
} from '../../../agents/langgraph/ChatGraph/types.js';

const ITEM_SEPARATOR = '\n\n---\n\n';

function renderItem(item: TurnMaterialItem): string {
  switch (item.kind) {
    case 'upload':
    case 'paste':
      return `### ${item.heading}\n\n${item.text}`;
    case 'reference':
      return `## ${item.heading}\n\n${item.text}`;
    case 'client':
    case 'sharepic':
      return item.text;
  }
}

/**
 * Der Prompt-Text zur Liste, `null` ohne Material. Der Sharepic-Stand hängt ohne
 * Trenner an — so hat ihn `earlyHandlerStage` immer angefügt.
 */
export function renderTurnMaterial(items: readonly TurnMaterialItem[]): string | null {
  if (items.length === 0) return null;
  return items
    .map((item, i) => {
      const body = renderItem(item);
      if (i === 0) return body;
      return `${item.kind === 'sharepic' ? '\n\n' : ITEM_SEPARATOR}${body}`;
    })
    .join('');
}

type MaterialHolder = Pick<ChatGraphState, 'attachmentContext' | 'turnMaterial'>;

/** Setzt die Liste und ihren Text zusammen — der einzige Schreibweg. */
export function setTurnMaterial(state: MaterialHolder, items: TurnMaterialItem[]): void {
  state.turnMaterial = items;
  state.attachmentContext = renderTurnMaterial(items);
}

/**
 * Die Liste zum Lesen. Ein Zustand, den eine Fassung vor #5430 in Redis abgelegt
 * hat (Freigabe-, Rückfrage- und Client-Werkzeug-Pausen leben bis zu 24 h), kennt
 * sie nicht und trägt nur den Text: der zählt dann als ein Stück Client-Kontext —
 * ungeteilt, also ohne Rätselraten über seine Abschnitte.
 */
export function turnMaterialOf(state: {
  attachmentContext?: string | null | undefined;
  turnMaterial?: readonly TurnMaterialItem[] | undefined;
}): readonly TurnMaterialItem[] {
  if (state.turnMaterial) return state.turnMaterial;
  return state.attachmentContext ? [{ kind: 'client', text: state.attachmentContext }] : [];
}

export function appendTurnMaterial(state: MaterialHolder, item: TurnMaterialItem): void {
  setTurnMaterial(state, [...state.turnMaterial, item]);
}

export const isFileItem = (
  item: TurnMaterialItem
): item is Extract<TurnMaterialItem, { kind: 'upload' | 'paste' }> =>
  item.kind === 'upload' || item.kind === 'paste';

/**
 * Ersetzt die Datei-Einträge (Uploads und Pastes) durch `files`, an der Stelle
 * des ersten; alles andere bleibt, wo es war.
 */
export function replaceFileItems(
  items: readonly TurnMaterialItem[],
  files: TurnMaterialItem[]
): TurnMaterialItem[] {
  const at = items.findIndex(isFileItem);
  if (at === -1) return [...items, ...files];
  return [...items.slice(0, at), ...files, ...items.slice(at).filter((item) => !isFileItem(item))];
}
