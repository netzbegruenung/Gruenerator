// SPDX-License-Identifier: MPL-2.0
/**
 * Auswahl aus der Ebenen-Liste. Die Liste sitzt in der Seitenleiste des
 * Editors, der Store gehört der Seite (`CanvasStoreProvider`) — die Änderung
 * reist deshalb als Wert über `GenericCanvasRef.selectLayers` und landet hier
 * bei den Auswahl-Aktionen, die auch ein Klick auf die Fläche benutzt.
 */

import type { CanvasEditorStoreApi } from '../stores/createCanvasEditorStore';

export type LayerSelectionChange =
  /** Nur dieses Element (Pfeiltaste, Klick). */
  | { kind: 'only'; id: string }
  /** Dazunehmen oder herausnehmen (Leertaste, Strg/⌘-Klick). */
  | { kind: 'toggle'; id: string }
  /** Genau diese Elemente (Umschalt+Pfeil, Umschalt+Klick). */
  | { kind: 'set'; ids: readonly string[] };

export function applyLayerSelection(store: CanvasEditorStoreApi, change: LayerSelectionChange) {
  const selection = store.getState();
  if (change.kind === 'only') selection.setSelectedElement(change.id);
  else if (change.kind === 'toggle') selection.selectLayer(change.id, true);
  else selection.setSelectedLayers([...change.ids]);
}
