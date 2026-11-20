import { createInProject as createSharedInProject } from '@gruenerator/shared/groups';

import { createSlideDeck } from '../docs/createSlideDeck';

export type NewInProjectKind = 'doc' | 'sheet' | 'pres' | 'board';

export const NEW_IN_PROJECT: { kind: NewInProjectKind; label: string }[] = [
  { kind: 'doc', label: 'Neues Doc' },
  { kind: 'sheet', label: 'Neues Sheet' },
  { kind: 'pres', label: 'Neue Präsentation' },
  { kind: 'board', label: 'Neues Board' },
];

/**
 * Legt den Inhalt direkt im Projekt an — Dokument und Freigabe entstehen auf dem
 * Server in einer Transaktion — und liefert den Pfad zum Editor.
 */
export async function createInProject(
  kind: NewInProjectKind,
  groupId: string,
  locale: string | null
): Promise<string> {
  if (kind === 'pres') {
    const deck = await createSlideDeck(locale, groupId);
    return `/studio/canvas/${deck.id}`;
  }
  const id = await createSharedInProject(kind, groupId);
  return kind === 'board' ? `/boards/${id}` : `/office/${id}`;
}
