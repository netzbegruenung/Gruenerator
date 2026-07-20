import { describe, expect, it } from 'vitest';

import {
  checkEditAccess,
  softDeleteCollaborativeDocument,
  updateCollaborativeDocument,
  type QueryRunner,
} from './CollaborativeDocumentService.js';

const DOCS_ONLY = ['blank', 'docs', 'sheets', 'presentations'];
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const STRANGER = 'user-stranger';

const doc = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  created_by: OWNER,
  permissions: null,
  ...overrides,
});

/**
 * Mock query runner routing by SQL shape. `select` answers the initial
 * document lookup (empty ⇒ not found), `group` the group-write lookup, and
 * `update` the RETURNING row. Records calls for assertions.
 */
function makeRunner(opts: { select?: unknown[]; group?: unknown[]; update?: unknown[] }): {
  run: QueryRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const run = (async (sql: string) => {
    calls.push(sql);
    if (sql.includes('group_content_shares')) return opts.group ?? [];
    if (sql.trimStart().startsWith('UPDATE')) return opts.update ?? [];
    return opts.select ?? [];
  }) as QueryRunner;
  return { run, calls };
}

describe('checkEditAccess', () => {
  it('returns not_found when the row is absent (or subtype out of scope)', async () => {
    const { run } = makeRunner({ select: [] });
    expect(await checkEditAccess(run, 'doc-1', OWNER, DOCS_ONLY)).toEqual({ status: 'not_found' });
  });

  it('allows the creator', async () => {
    const { run } = makeRunner({ select: [doc()] });
    const res = await checkEditAccess(run, 'doc-1', OWNER, DOCS_ONLY);
    expect(res).toMatchObject({ status: 'ok', isOwner: true });
  });

  it('allows a direct editor but not a viewer', async () => {
    const editorRunner = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: { [EDITOR]: { level: 'editor' } } })],
    });
    expect(await checkEditAccess(editorRunner.run, 'doc-1', EDITOR, DOCS_ONLY)).toMatchObject({
      status: 'ok',
      isOwner: false,
    });

    const viewerRunner = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: { [VIEWER]: { level: 'viewer' } } })],
      group: [],
    });
    expect(await checkEditAccess(viewerRunner.run, 'doc-1', VIEWER, DOCS_ONLY)).toEqual({
      status: 'forbidden',
    });
  });

  it('allows a group member with write permission', async () => {
    const { run } = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: {} })],
      group: [{ permissions: { read: true, write: true } }],
    });
    expect(await checkEditAccess(run, 'doc-1', STRANGER, DOCS_ONLY)).toMatchObject({
      status: 'ok',
    });
  });
});

describe('updateCollaborativeDocument', () => {
  it('propagates forbidden without issuing an UPDATE', async () => {
    const { run, calls } = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: { [VIEWER]: { level: 'viewer' } } })],
      group: [],
    });
    const res = await updateCollaborativeDocument(run, 'doc-1', VIEWER, DOCS_ONLY, { title: 'x' });
    expect(res.status).toBe('forbidden');
    expect(calls.some((s) => s.trimStart().startsWith('UPDATE'))).toBe(false);
  });

  it('renames and returns the updated row', async () => {
    const { run, calls } = makeRunner({
      select: [doc()],
      update: [doc({ title: 'Renamed' })],
    });
    const res = await updateCollaborativeDocument(run, 'doc-1', OWNER, DOCS_ONLY, {
      title: 'Renamed',
    });
    expect(res).toEqual({ status: 'ok', document: doc({ title: 'Renamed' }) });
    expect(calls.some((s) => s.includes('title = $1'))).toBe(true);
  });
});

describe('softDeleteCollaborativeDocument', () => {
  it('rejects a foreign board via the docs scope (row filtered out ⇒ not_found)', async () => {
    // A board id queried under DOCS_ONLY subtypes matches no row — this is the
    // guard that keeps the /docs route from deleting boards/canvas.
    const { run, calls } = makeRunner({ select: [] });
    expect(await softDeleteCollaborativeDocument(run, 'board-1', OWNER, DOCS_ONLY)).toEqual({
      status: 'not_found',
    });
    expect(calls.some((s) => s.trimStart().startsWith('UPDATE'))).toBe(false);
  });

  it('forbids a non-owner (editor) from deleting', async () => {
    const { run } = makeRunner({
      select: [{ created_by: STRANGER, permissions: { [EDITOR]: { level: 'editor' } } }],
    });
    expect(await softDeleteCollaborativeDocument(run, 'doc-1', EDITOR, DOCS_ONLY)).toEqual({
      status: 'forbidden',
    });
  });

  it('soft-deletes for the owner', async () => {
    const { run, calls } = makeRunner({ select: [{ created_by: OWNER, permissions: null }] });
    expect(await softDeleteCollaborativeDocument(run, 'doc-1', OWNER, DOCS_ONLY)).toEqual({
      status: 'ok',
    });
    expect(calls.some((s) => s.includes('is_deleted = true'))).toBe(true);
  });
});
