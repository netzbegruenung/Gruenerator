import { getContractsClient } from '../api/index.js';

export type CreateInProjectKind = 'doc' | 'sheet' | 'board';

export const CREATE_IN_PROJECT_FALLBACK = 'Konnte nicht angelegt werden.';

function fail(res: { status: number; body: unknown }): never {
  const body = res.body as { error?: unknown } | null;
  throw new Error(
    typeof body?.error === 'string' && res.status === 403 ? body.error : CREATE_IN_PROJECT_FALLBACK
  );
}

/**
 * Legt Doc, Sheet oder Board direkt im Projekt an — Inhalt und Freigabe entstehen
 * auf dem Server in einer Transaktion — und liefert die ID. Die Route dorthin
 * kennt jede Plattform selbst. Präsentationen brauchen den Canvas-Editor und
 * bleiben deshalb beim Web.
 */
export async function createInProject(kind: CreateInProjectKind, groupId: string): Promise<string> {
  const client = getContractsClient();
  if (kind === 'board') {
    const res = await client.boards.createBoard({
      body: { title: 'Neues Board', boardType: 'kanban', groupId },
    });
    if (res.status !== 201) fail(res);
    return res.body.id;
  }
  const res = await client.docs.createDocument({
    body:
      kind === 'sheet'
        ? { title: 'Neue Tabelle', document_subtype: 'sheets', groupId }
        : { title: 'Neues Dokument', document_subtype: 'blank', groupId },
  });
  if (res.status !== 201) fail(res);
  return res.body.id;
}
