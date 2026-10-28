// SPDX-License-Identifier: MPL-2.0
import { canMoveLayer, type CanvasItem } from './canvasLayerManager.js';
import { hostElementKind } from './elementKinds.js';
import { findDuplicableEntry, type TemplateEntryLookup } from './duplicateElement.js';
import { isLockable, lockedIdsOf, lockStateOf, type LockState } from './layerLock.js';
import { findElementRemover } from './removeElement.js';

import type { OrientationDoor } from './orientElement.js';
import type { BaseCanvasState } from '../configs/factory/baseTypes.js';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers.js';

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
  /** Wie viel der sperrbaren Auswahl gesperrt ist. */
  lock: LockState;
  /** Mindestens ein ausgewähltes Element lässt sich sperren. */
  canLock: boolean;
  /** Jedes ausgewählte Element lässt sich drehen (keins gesperrt, kein Lesemodus). */
  canRotate: boolean;
  /** Einzeln: das Element spiegelt; mehrere: jedes lässt sich drehen, Text wandert lesbar mit. */
  canFlip: boolean;
  /** Die Drehung der Einzelauswahl, sonst `null`. */
  rotation: number | null;
  /** Mindestens ein Element lässt sich verschieben (Ausrichten, Position); gesperrte bleiben stehen. */
  canAlign: boolean;
  /** Mindestens drei Elemente lassen sich verschieben. */
  canDistribute: boolean;
  /** Ein einzelner Text, Balken, Störer oder Badge, der sich auf der Fläche bearbeiten lässt („Text bearbeiten“, F2). */
  canEditText: boolean;
}

export interface SelectionCapabilitiesInput {
  ids: readonly string[];
  state: Partial<BaseCanvasState>;
  actions: OptionalCanvasActions;
  template?: TemplateEntryLookup;
  renderList: readonly CanvasItem[];
  /** Die Tür zum Drehen & Spiegeln eines Elements — siehe `utils/orientElement.ts`. */
  orient: (id: string) => OrientationDoor | null;
  /** Lesemodus: Drehen & Spiegeln werden nicht angeboten. */
  readOnly: boolean;
}

export function selectionCapabilities({
  ids,
  state,
  actions,
  template,
  renderList,
  orient,
  readOnly,
}: SelectionCapabilitiesInput): SelectionCapabilities {
  const single = ids.length === 1 ? ids[0]! : null;
  const lockable = lockableIds(ids, renderList);
  const doors = readOnly ? [] : ids.map(orient);
  const canRotate = ids.length > 0 && doors.length === ids.length && doors.every((d) => d !== null);
  const singleDoor = single !== null && canRotate ? doors[0]! : null;
  const movable = doors.filter((d) => d !== null).length;
  return {
    count: ids.length,
    canCopy: ids.some((id) => findDuplicableEntry(state, id, template) !== null),
    canDelete: ids.some((id) => findElementRemover(state, actions, id) !== null),
    canBringForward: single !== null && canMoveLayer(renderList, single, 'forward'),
    canSendBackward: single !== null && canMoveLayer(renderList, single, 'backward'),
    lock: lockStateOf(lockedIdsOf(state), lockable),
    canLock: lockable.length > 0,
    canRotate,
    canFlip: singleDoor ? singleDoor.canFlip : canRotate,
    rotation: singleDoor ? singleDoor.rotation : null,
    canAlign: movable > 0,
    canDistribute: movable >= 3,
    canEditText: !readOnly && single !== null && isEditableText(renderList, single),
  };
}

/**
 * Eigene Texte, Balken, Störer und Badges immer, Vorlagen-Texte nur mit
 * `editable` — wie `CanvasText` es annimmt.
 */
function isEditableText(renderList: readonly CanvasItem[], id: string): boolean {
  const item = renderList.find((i) => i.id === id);
  if (item?.type === 'additional-text' || item?.type === 'balken') return true;
  if (item && hostElementKind(item.type)?.editableText) return true;
  if (item?.type === 'circle-badge' || item?.type === 'pill-badge') return true;
  return item?.type === 'element' && item.data.type === 'text' && item.data.editable === true;
}

/** Die Ids der Auswahl, die sich sperren lassen. */
export function lockableIds(ids: readonly string[], renderList: readonly CanvasItem[]): string[] {
  return ids.filter((id) => {
    const item = renderList.find((i) => i.id === id);
    return item !== undefined && isLockable(item);
  });
}
