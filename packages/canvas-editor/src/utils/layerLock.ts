/**
 * Gesperrte Elemente: `lockedLayerIds` auf der Seite, eine Liste von Ids wie
 * `layerOrder`. Sie gilt für Instanzen und Vorlagen-Elemente gleich; Kopien
 * bekommen neue Ids und sind damit entsperrt. Gesperrt heißt: nicht ziehen,
 * nicht skalieren oder drehen, nicht schieben, nicht löschen — gestalten
 * lässt sich das Element weiter.
 */

import type { CanvasItem } from './canvasLayerManager';

export type LockState = 'all' | 'some' | 'none';

export function lockedIdsOf(state: object): readonly string[] {
  const value = (state as { lockedLayerIds?: unknown }).lockedLayerIds;
  return Array.isArray(value) ? (value as string[]) : [];
}

export function isLayerLocked(state: object, id: string): boolean {
  return lockedIdsOf(state).includes(id);
}

/**
 * Lässt sich das Element sperren? Alles, was man bewegen kann — nicht die
 * Hintergrund-Ebenen (das Foto hat sein eigenes „Fixieren“) und nicht
 * Vorlagen-Elemente, die ohnehin feststehen.
 */
export function isLockable(item: CanvasItem): boolean {
  if (item.type !== 'element') return true;
  const element = item.data;
  if ((element.order ?? 0) < 0 || element.type === 'background') return false;
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
