import { boardAssigneeUserIds } from '@gruenerator/shared/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const dbQuery = vi.fn<(...a: unknown[]) => Promise<unknown[]>>();
let doc: Y.Doc;

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: (...a: unknown[]) => dbQuery(...a) }),
}));
vi.mock('./BoardService.js', () => ({
  FIELD_IDS: {
    TITLE: 'field-title',
    STATUS: 'field-status',
    DESCRIPTION: 'field-description',
    ASSIGNEE: 'field-assignee',
    DUE_DATE: 'field-due',
  },
  loadBoardYjsDoc: () => Promise.resolve(doc),
}));

const { updateCard } = await import('./boardCardWriteService.js');

/** Ein Board mit einer Karte, deren Zuständigkeitszelle `assignee` trägt. */
function boardWith(assignee: string): Y.Doc {
  const d = new Y.Doc();
  const row = new Y.Map<unknown>();
  row.set('id', 'r1');
  const cells = new Y.Map<unknown>();
  cells.set('field-title', 'Plakate');
  cells.set('field-assignee', assignee);
  row.set('cells', cells);
  d.getArray<Y.Map<unknown>>('rows').push([row]);
  return d;
}

/** Die Zelle, wie sie persistiert wurde — aus dem geschriebenen Update gelesen. */
async function persistedAssigneeCell(): Promise<string> {
  const write = dbQuery.mock.calls.find((c) => String(c[0]).includes('yjs_document_updates'));
  const { gunzipSync } = await import('zlib');
  const restored = new Y.Doc();
  Y.applyUpdate(restored, gunzipSync((write?.[1] as unknown[])[1] as Buffer));
  const row = restored.getArray<Y.Map<unknown>>('rows').get(0);
  return (row.get('cells') as Y.Map<unknown>).get('field-assignee') as string;
}

const anna = { id: '11111111-1111-4111-8111-111111111111', name: 'Anna', avatarRobotId: 2 };

describe('updateCard — Zuständige', () => {
  beforeEach(() => {
    dbQuery.mockReset();
    dbQuery.mockResolvedValue([]);
  });

  it('schreibt die Person als JSON mit Profil-Id und meldet sie als neu', async () => {
    doc = boardWith('');
    const out = await updateCard('b1', 'r1', { assignees: { mode: 'add', person: anna } });
    expect(out.applied).toEqual(['Zuständig']);
    expect(out.addedAssigneeIds).toEqual([anna.id]);
    expect(out.assigneeNames).toEqual(['Anna']);
    expect(out.cardTitle).toBe('Plakate');
    expect(boardAssigneeUserIds(await persistedAssigneeCell())).toEqual([anna.id]);
  });

  it('ein nackter Alt-Name bleibt beim Hinzufügen erhalten, neu ist nur die Person', async () => {
    doc = boardWith('Mia');
    const out = await updateCard('b1', 'r1', { assignees: { mode: 'add', person: anna } });
    expect(out.addedAssigneeIds).toEqual([anna.id]);
    expect(out.assigneeNames).toEqual(['Mia', 'Anna']);
  });

  it('wer schon zuständig ist, ändert nichts und meldet niemanden', async () => {
    doc = boardWith(JSON.stringify([anna]));
    const out = await updateCard('b1', 'r1', { assignees: { mode: 'add', person: anna } });
    expect(out.applied).toEqual([]);
    expect(out.addedAssigneeIds).toEqual([]);
  });
});
