import { getContractsClient } from '@gruenerator/shared/api';

import { createSlideDeck } from '../docs/createSlideDeck';

export type NewInProjectKind = 'doc' | 'sheet' | 'pres' | 'board';

export const NEW_IN_PROJECT: { kind: NewInProjectKind; label: string }[] = [
  { kind: 'doc', label: 'Neues Doc' },
  { kind: 'sheet', label: 'Neues Sheet' },
  { kind: 'pres', label: 'Neue Präsentation' },
  { kind: 'board', label: 'Neues Board' },
];

const FALLBACK = 'Konnte nicht angelegt werden.';

function fail(res: { status: number; body: unknown }): never {
  const body = res.body as { error?: unknown } | null;
  throw new Error(typeof body?.error === 'string' && res.status === 403 ? body.error : FALLBACK);
}

/**
 * Legt den Inhalt direkt im Projekt an — Dokument und Freigabe entstehen auf dem
 * Server in einer Transaktion — und liefert den Pfad zum Editor.
 */
export async function createInProject(
  kind: NewInProjectKind,
  groupId: string,
  locale: string | null
): Promise<string> {
  const client = getContractsClient();
  if (kind === 'board') {
    const res = await client.boards.createBoard({
      body: { title: 'Neues Board', boardType: 'kanban', groupId },
    });
    if (res.status !== 201) fail(res);
    return `/boards/${res.body.id}`;
  }
  if (kind === 'pres') {
    const deck = await createSlideDeck(locale, groupId);
    return `/studio/canvas/${deck.id}`;
  }
  const res = await client.docs.createDocument({
    body:
      kind === 'sheet'
        ? { title: 'Neue Tabelle', document_subtype: 'sheets', groupId }
        : { title: 'Neues Dokument', document_subtype: 'blank', groupId },
  });
  if (res.status !== 201) fail(res);
  return `/office/${res.body.id}`;
}
