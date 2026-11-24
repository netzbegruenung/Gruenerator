import { gunzipSync, gzipSync } from 'zlib';

import { boardAssigneeUserIds } from '@gruenerator/shared/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const writes: Buffer[] = [];
let stored: Buffer;

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: (sql: string, params: unknown[]) => {
      if (sql.includes('yjs_document_snapshots')) return Promise.resolve([]);
      if (sql.startsWith('SELECT update_data')) return Promise.resolve([{ update_data: stored }]);
      if (sql.includes('INSERT INTO yjs_document_updates')) writes.push(params[1] as Buffer);
      return Promise.resolve([]);
    },
  }),
}));

const { addRowsToBoard } = await import('./BoardService.js');

/** Ein leeres Board mit den Spalten „Offen" und „In Arbeit". */
function emptyBoard(): Buffer {
  const d = new Y.Doc();
  d.getArray('fields').push([
    {
      id: 'field-status',
      name: 'Status',
      type: 'singleSelect',
      typeOptions: {
        options: [
          { id: 'status-1', name: 'Offen' },
          { id: 'status-2', name: 'In Arbeit' },
        ],
      },
      order: 1,
    },
  ]);
  return gzipSync(Buffer.from(Y.encodeStateAsUpdate(d)));
}

function writtenCells(): Record<string, unknown> {
  const d = new Y.Doc();
  Y.applyUpdate(d, gunzipSync(writes[writes.length - 1]));
  const row = d.getArray<Y.Map<unknown>>('rows').get(0);
  return (row.get('cells') as Y.Map<unknown>).toJSON();
}

describe('addRowsToBoard', () => {
  beforeEach(() => {
    writes.length = 0;
    stored = emptyBoard();
  });

  it('macht aus einem Spaltennamen die Spalten-Id, sonst stünde die Karte in „Ohne Status"', async () => {
    await addRowsToBoard('b1', [{ title: 'Flyer', status: 'in arbeit' }], 'u1');
    expect(writtenCells()['field-status']).toBe('status-2');
  });

  it('eine Id bleibt eine Id, Unbekanntes bleibt wie bisher stehen', async () => {
    await addRowsToBoard('b1', [{ title: 'A', status: 'status-1' }], 'u1');
    expect(writtenCells()['field-status']).toBe('status-1');
    await addRowsToBoard('b1', [{ title: 'B', status: 'Irgendwas' }], 'u1');
    expect(writtenCells()['field-status']).toBe('Irgendwas');
  });

  it('eine aufgelöste Person landet mit Profil-Id in der Zelle, ein Text wie bisher', async () => {
    const anna = { id: '11111111-1111-4111-8111-111111111111', name: 'Anna', avatarRobotId: 2 };
    await addRowsToBoard('b1', [{ title: 'A', assignee: anna }], 'u1');
    expect(boardAssigneeUserIds(writtenCells()['field-assignee'])).toEqual([anna.id]);
    await addRowsToBoard('b1', [{ title: 'B', assignee: 'Mia' }], 'u1');
    expect(writtenCells()['field-assignee']).toBe('Mia');
  });
});
