/**
 * Share-settings handlers (setSharePermission / setShareMode).
 *
 * Regression guards for two authorization fixes:
 *  - Downgrading the link permission to 'viewer' must revoke the auto-granted
 *    'auto:share_link' entries, otherwise users who opened the link while it was
 *    'editor' keep write access after the downgrade.
 *  - Turning a document 'public' must default the link to view-only, so a public
 *    link is not silently anonymously-writable (the column default is 'editor').
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

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

/** Route SELECT → provided row, UPDATE → []. */
function primeDb(row: Record<string, unknown> | null) {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (/UPDATE collaborative_documents/i.test(sql)) return [];
    if (/FROM collaborative_documents/i.test(sql)) return row ? [row] : [];
    return [];
  });
}

const lastUpdate = () =>
  query.mock.calls.find(([sql]) => /UPDATE collaborative_documents/i.test(sql as string)) as
    [string, unknown[]] | undefined;

beforeEach(() => primeDb(ownedRow()));

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
