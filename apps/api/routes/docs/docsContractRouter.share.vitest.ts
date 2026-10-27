/**
 * Share-settings handlers (setSharePermission / setShareMode).
 *
 * Regression guards for two authorization fixes:
 *  - Downgrading the link permission to 'viewer' must revoke the auto-granted
 *    'auto:share_link' entries, otherwise users who opened the link while it was
 *    'editor' keep write access after the downgrade.
 *  - Turning a document 'public' must default the link to view-only, so a public
 *    link is not silently anonymously-writable (the column default is 'editor').
 *  - A plain sharepic (subtype 'canvas') is shared behind a login only; just a
 *    Vorlage's snapshot canvas may still get a public link.
 *  - Every share-settings change closes the document's open Hocuspocus
 *    connections after the write, so the new rights apply to open sessions too.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const { query, isVorlageSnapshotCanvas, closeCollabRooms } = vi.hoisted(() => ({
  query: vi.fn(),
  isVorlageSnapshotCanvas: vi.fn(),
  closeCollabRooms: vi.fn(),
}));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

vi.mock('../../services/canvas/canvasRepository.js', () => ({
  CANVAS_SUBTYPE: 'canvas',
  isVorlageSnapshotCanvas,
}));

vi.mock('../../services/collab/hocuspocusInternal.js', () => ({ closeCollabRooms }));

const { docsContractRouter } = await import('./docsContractRouter.js');

type ShareResult = { status: number; body: Record<string, unknown> };

const ownedRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  created_by: 'owner-1',
  permissions: {},
  is_public: false,
  share_permission: 'editor',
  share_mode: 'private',
  is_deleted: false,
  ...overrides,
});

const req = (id = 'owner-1') =>
  ({ user: { id }, originalUrl: '/api/docs/doc-1/share' }) as unknown as Request;

const setSharePermission = (permission: 'viewer' | 'editor', userId = 'owner-1') =>
  (
    docsContractRouter.setSharePermission as unknown as (a: {
      req: Request;
      params: { id: string };
      body: { permission: string };
    }) => Promise<ShareResult>
  )({ req: req(userId), params: { id: 'doc-1' }, body: { permission } });

const enableSharing = (userId = 'owner-1') =>
  (
    docsContractRouter.enableSharing as unknown as (a: {
      req: Request;
      params: { id: string };
    }) => Promise<ShareResult>
  )({ req: req(userId), params: { id: 'doc-1' } });

const setShareMode = (mode: 'private' | 'authenticated' | 'public', userId = 'owner-1') =>
  (
    docsContractRouter.setShareMode as unknown as (a: {
      req: Request;
      params: { id: string };
      body: { mode: string };
    }) => Promise<ShareResult>
  )({ req: req(userId), params: { id: 'doc-1' }, body: { mode } });

/** Route SELECT → provided row, UPDATE → [], group-share writes → one matched row. */
function primeDb(row: Record<string, unknown> | null) {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (/group_content_shares/i.test(sql)) return [{ id: 'share-1' }];
    if (/UPDATE collaborative_documents/i.test(sql)) return [];
    if (/FROM collaborative_documents/i.test(sql)) return row ? [row] : [];
    return [];
  });
}

const lastUpdate = () =>
  query.mock.calls.find(([sql]) => /UPDATE collaborative_documents/i.test(sql as string)) as
    [string, unknown[]] | undefined;

beforeEach(() => {
  primeDb(ownedRow());
  isVorlageSnapshotCanvas.mockReset().mockResolvedValue(false);
  closeCollabRooms.mockReset().mockResolvedValue(undefined);
});

describe('setSharePermission', () => {
  it('strips auto-granted link permissions when downgrading to viewer', async () => {
    const res = await setSharePermission('viewer');
    expect(res.status).toBe(200);
    expect(res.body.share_permission).toBe('viewer');
    const update = lastUpdate();
    expect(update?.[0]).toMatch(/jsonb_object_agg/i);
    expect(update?.[0]).toMatch(/granted_by/i);
    expect(update?.[1]).toContain('auto:share_link');
    expect(update?.[1]).toContain('viewer');
  });

  it('rejects a non-owner with 403', async () => {
    const res = await setSharePermission('viewer', 'stranger-2');
    expect(res.status).toBe(403);
    expect(lastUpdate()).toBeUndefined();
  });
});

describe('setShareMode', () => {
  it('defaults a freshly-public link to viewer', async () => {
    const res = await setShareMode('public');
    expect(res.status).toBe(200);
    expect(res.body.share_permission).toBe('viewer');
    const update = lastUpdate();
    expect(update?.[1]).toContain('viewer');
    // Auto-grants are also stripped on the transition.
    expect(update?.[0]).toMatch(/jsonb_object_agg/i);
  });

  it('does not downgrade a document that is already public + editor', async () => {
    primeDb(ownedRow({ is_public: true, share_mode: 'public', share_permission: 'editor' }));
    const res = await setShareMode('public');
    expect(res.body.share_permission).toBe('editor');
    expect(lastUpdate()?.[1]).toContain('editor');
  });

  it('leaves authenticated mode without forcing viewer', async () => {
    const res = await setShareMode('authenticated');
    expect(res.status).toBe(200);
    expect(res.body.share_mode).toBe('authenticated');
    expect(res.body.share_permission).toBe('editor');
  });

  it('rejects a non-owner with 403', async () => {
    const res = await setShareMode('public', 'stranger-2');
    expect(res.status).toBe(403);
  });
});

describe('enableSharing', () => {
  it('defaults a freshly-public link to viewer and strips auto-grants', async () => {
    const res = await enableSharing();
    expect(res.status).toBe(200);
    expect(res.body.is_public).toBe(true);
    expect(res.body.share_mode).toBe('public');
    expect(res.body.share_permission).toBe('viewer');
    const update = lastUpdate();
    expect(update?.[1]).toContain('viewer');
    expect(update?.[0]).toMatch(/jsonb_object_agg/i);
    expect(update?.[1]).toContain('auto:share_link');
  });

  it('does not downgrade a document that is already public + editor', async () => {
    primeDb(ownedRow({ is_public: true, share_mode: 'public', share_permission: 'editor' }));
    const res = await enableSharing();
    expect(res.body.share_permission).toBe('editor');
  });

  it('rejects a non-owner with 403', async () => {
    const res = await enableSharing('stranger-2');
    expect(res.status).toBe(403);
    expect(lastUpdate()).toBeUndefined();
  });
});

describe('sharepics are login-only', () => {
  const sharepic = () => ownedRow({ document_subtype: 'canvas' });

  it('rejects a public share mode for a plain sharepic', async () => {
    primeDb(sharepic());
    const res = await setShareMode('public');
    expect(res.status).toBe(400);
    expect(lastUpdate()).toBeUndefined();
  });

  it('rejects enableSharing for a plain sharepic', async () => {
    primeDb(sharepic());
    const res = await enableSharing();
    expect(res.status).toBe(400);
    expect(lastUpdate()).toBeUndefined();
  });

  it('allows the login-gated mode for a plain sharepic', async () => {
    primeDb(sharepic());
    const res = await setShareMode('authenticated');
    expect(res.status).toBe(200);
    expect(res.body.share_mode).toBe('authenticated');
  });

  it("still lets a Vorlage's snapshot canvas go public", async () => {
    primeDb(sharepic());
    isVorlageSnapshotCanvas.mockResolvedValue(true);
    const res = await setShareMode('public');
    expect(res.status).toBe(200);
    expect(res.body.share_mode).toBe('public');
  });

  it('leaves documents untouched by the rule', async () => {
    primeDb(ownedRow({ document_subtype: 'docs' }));
    const res = await setShareMode('public');
    expect(res.status).toBe(200);
    expect(isVorlageSnapshotCanvas).not.toHaveBeenCalled();
  });
});

describe('open collaboration connections', () => {
  const call = (name: string, extra: Record<string, unknown> = {}, userId = 'owner-1') =>
    (
      docsContractRouter[name as keyof typeof docsContractRouter] as unknown as (
        a: Record<string, unknown>
      ) => Promise<ShareResult>
    )({ req: req(userId), params: { id: 'doc-1', groupId: 'group-1' }, ...extra });

  /** Index (in call order) of the last write the handler issued. */
  const lastWriteOrder = () => {
    const writes = query.mock.calls.flatMap((args: unknown[], i) =>
      /^\s*(UPDATE|DELETE)\b/i.test(String(args[0])) ? [query.mock.invocationCallOrder[i] ?? 0] : []
    );
    return writes.length === 0 ? Infinity : Math.max(...writes);
  };

  it.each([
    ['setSharePermission', { body: { permission: 'viewer' } }],
    ['setShareMode', { body: { mode: 'private' } }],
    ['setShareMode', { body: { mode: 'authenticated' } }],
    ['setShareMode', { body: { mode: 'public' } }],
    ['enableSharing', {}],
    ['disableSharing', {}],
    ['removeGroupShare', {}],
    ['updateGroupShare', { body: { permission_level: 'viewer' } }],
  ])('%s %j closes the room after the write', async (name, extra) => {
    const res = await call(name, extra);

    expect(res.status).toBe(200);
    expect(closeCollabRooms).toHaveBeenCalledTimes(1);
    expect(closeCollabRooms).toHaveBeenCalledWith(['doc-1']);
    expect(closeCollabRooms.mock.invocationCallOrder[0]).toBeGreaterThan(lastWriteOrder());
  });

  it.each([
    ['setSharePermission', { body: { permission: 'viewer' } }],
    ['setShareMode', { body: { mode: 'private' } }],
    ['disableSharing', {}],
    ['removeGroupShare', {}],
    ['updateGroupShare', { body: { permission_level: 'viewer' } }],
  ])('%s by a non-owner closes nothing', async (name, extra) => {
    const res = await call(name, extra, 'stranger-2');
    expect(res.status).toBe(403);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  it('does not hold the response for the close', async () => {
    closeCollabRooms.mockReturnValue(new Promise(() => {}));
    const res = await call('setSharePermission', { body: { permission: 'viewer' } });
    expect(res.status).toBe(200);
  });
});
