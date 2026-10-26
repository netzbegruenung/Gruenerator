import { canMoveLayer, type CanvasItem } from './canvasLayerManager';
import { findDuplicableEntry, type TemplateEntryLookup } from './duplicateElement';
import { isLockable, lockedIdsOf, lockStateOf, type LockState } from './layerLock';
import { findElementRemover } from './removeElement';

import type { OrientationDoor } from './orientElement';
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
  };
}

/** Die Ids der Auswahl, die sich sperren lassen. */
export function lockableIds(ids: readonly string[], renderList: readonly CanvasItem[]): string[] {
  return ids.filter((id) => {
    const item = renderList.find((i) => i.id === id);
    return item !== undefined && isLockable(item);
  });
}
