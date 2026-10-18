import { canMoveLayer, type CanvasItem } from './canvasLayerManager';
import { findDuplicableEntry, type TemplateEntryLookup } from './duplicateElement';
import { findElementRemover } from './removeElement';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';

/**
 * Was mit der Auswahl geht — eine Frage für Kontextleiste, Pille und Menü,
 * gestellt an dieselben Türen, die die Aktion dann ausführen.
 */
export interface SelectionCapabilities {
  count: number;
  /** Mindestens ein Element lässt sich kopieren — und damit auch duplizieren. */
  canCopy: boolean;
  /** Mindestens ein Element lässt sich löschen. */
  canDelete: boolean;
  /** Ein einzelnes Element, das nach vorne kann — einen Schritt oder ganz. */
  canBringForward: boolean;
  /** Dasselbe nach hinten; unter den Hintergrund geht es nicht. */
  canSendBackward: boolean;
}

export interface SelectionCapabilitiesInput {
  ids: readonly string[];
  state: Partial<BaseCanvasState>;
  actions: OptionalCanvasActions;
  template?: TemplateEntryLookup;
  renderList: readonly CanvasItem[];
}

export function selectionCapabilities({
  ids,
  state,
  actions,
  template,
  renderList,
}: SelectionCapabilitiesInput): SelectionCapabilities {
  const single = ids.length === 1 ? ids[0]! : null;
  return {
    count: ids.length,
    canCopy: ids.some((id) => findDuplicableEntry(state, id, template) !== null),
    canDelete: ids.some((id) => findElementRemover(state, actions, id) !== null),
    canBringForward: single !== null && canMoveLayer(renderList, single, 'forward'),
    canSendBackward: single !== null && canMoveLayer(renderList, single, 'backward'),
  };
}
