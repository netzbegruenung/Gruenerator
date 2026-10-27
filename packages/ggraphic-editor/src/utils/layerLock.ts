// SPDX-License-Identifier: MPL-2.0
/**
 * Gesperrte Elemente: `lockedLayerIds` auf der Seite, eine Liste von Ids wie
 * `layerOrder`. Sie gilt für Instanzen und Vorlagen-Elemente gleich; Kopien
 * bekommen neue Ids und sind damit entsperrt. Gesperrt heißt: nicht ziehen,
 * nicht skalieren oder drehen, nicht schieben, nicht löschen — gestalten
 * lässt sich das Element weiter.
 */

import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';

import type { CanvasItem } from './canvasItem';

export type LockState = 'all' | 'some' | 'none';

/**
 * Alle Leser gehen hier durch. Das Hintergrundfoto war in einer Vorlage einmal
 * sperrbar; eine gespeicherte Sperre darf den Ausschnitt-Modus nicht lähmen.
 */
export function lockedIdsOf(state: object): readonly string[] {
  const value = (state as { lockedLayerIds?: unknown }).lockedLayerIds;
  if (!Array.isArray(value)) return [];
  const ids = value as string[];
  return ids.includes(BACKGROUND_IMAGE_NODE_ID)
    ? ids.filter((id) => id !== BACKGROUND_IMAGE_NODE_ID)
    : ids;
}

export function isLayerLocked(state: object, id: string): boolean {
  return lockedIdsOf(state).includes(id);
}

/**
 * Lässt sich das Element sperren? Alles, was man bewegen kann — nicht die
 * Hintergrund-Ebenen (das Foto steht ohnehin fest, verschoben wird es nur im
 * Ausschnitt-Modus) und nicht Vorlagen-Elemente, die ohnehin feststehen.
 */
export function isLockable(item: CanvasItem): boolean {
  if (item.type !== 'element') return true;
  const element = item.data;
  if ((element.order ?? 0) < 0 || element.type === 'background') return false;
  if (element.id === BACKGROUND_IMAGE_NODE_ID) return false;
  return 'draggable' in element && element.draggable === true;
}

export function lockStateOf(lockedIds: readonly string[], ids: readonly string[]): LockState {
  const locked = ids.filter((id) => lockedIds.includes(id)).length;
  if (locked === 0) return 'none';
  return locked === ids.length ? 'all' : 'some';
}

/** Sperrt die `ids`; sind schon alle gesperrt, entsperrt es sie. */
export function toggledLocks(lockedIds: readonly string[], ids: readonly string[]): string[] {
  if (lockStateOf(lockedIds, ids) === 'all') return lockedIds.filter((id) => !ids.includes(id));
  return [...lockedIds, ...ids.filter((id) => !lockedIds.includes(id))];
}
