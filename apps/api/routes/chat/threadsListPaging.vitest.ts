/**
 * GET /api/chat-service/threads paging is opt-in (F0): shipped clients call it
 * without params and must keep getting the whole list in the old order. The
 * sidebar sends `limit`/`before`, the thread fetch sends `threadId` (#5987).
 */

import { listThreadsQuerySchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../services/chat/threadTitleService.js', () => ({
  generateThreadTitle: vi.fn(),
  threadNeedsTitle: vi.fn(),
}));
vi.mock('../auth/groups/index.js', () => ({
  getPostgresAndCheckMembership: vi.fn(),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');

const req = { user: { id: 'user-1' }, headers: {}, originalUrl: '/x' } as unknown as Request;
const THREAD_ID = '550e8400-e29b-41d4-a716-446655440001';

type ListHandler = (args: {
  req: Request;
  query: Record<string, unknown>;
}) => Promise<{ status: number; body: unknown }>;

async function callList(q: Record<string, unknown>) {
  const handler = threadsContractRouter.list as unknown as ListHandler;
  return handler({ req, query: q });
}

function lastCall(): { sql: string; params: unknown[] } {
  const [sql, params] = query.mock.calls[query.mock.calls.length - 1] as [string, unknown[]];
  return { sql, params };
}

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
});

describe('threadsContractRouter.list — additive paging', () => {
  it('no params: the whole list in the old order, no LIMIT, no cursor', async () => {
    const res = await callList({});
    expect(res.status).toBe(200);
    const { sql, params } = lastCall();
    expect(sql).toContain('ORDER BY t.updated_at DESC');
    expect(sql).not.toMatch(/LIMIT \$/);
    expect(sql).not.toContain('date_trunc');
    expect(params).toEqual(['user-1', 'user-1']);
  });

  it('limit: newest-first page with a stable (updated_at, id) order', async () => {
    await callList({ limit: 50 });
    const { sql, params } = lastCall();
    expect(sql).toContain(
      "ORDER BY date_trunc('milliseconds', t.updated_at) DESC, t.id DESC LIMIT $3"
    );
    expect(params).toEqual(['user-1', 'user-1', 50]);
  });

  it('before: keyset condition on (updated_at, id), combined with status', async () => {
    const cursor = `2026-11-01T10:00:00.123Z|${THREAD_ID}`;
    await callList({ status: 'archived', limit: 50, before: cursor });
    const { sql, params } = lastCall();
    expect(sql).toContain(
      "(date_trunc('milliseconds', t.updated_at), t.id) < ($4::timestamptz, $5::uuid)"
    );
    expect(sql).toContain('LIMIT $6');
    expect(params).toEqual([
      'user-1',
      'user-1',
      'archived',
      '2026-11-01T10:00:00.123Z',
      THREAD_ID,
      50,
    ]);
  });

  it('threadId: looks up one thread under the same access rules', async () => {
    await callList({ threadId: THREAD_ID });
    const { sql, params } = lastCall();
    expect(sql).toContain('AND t.id = $3::uuid');
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain('t.permissions ?');
    expect(params).toEqual(['user-1', 'user-1', THREAD_ID]);
  });

  it('slugSuffix: looks up one thread by its URL suffix under the same access rules', async () => {
    await callList({ slugSuffix: 'jjRBTz' });
    const { sql, params } = lastCall();
    expect(sql).toContain('AND t.slug_suffix = $3');
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(params).toEqual(['user-1', 'user-1', 'jjRBTz']);
  });

  it('rejects a malformed cursor with 400 instead of querying', async () => {
    for (const before of ['nonsense', `not-a-date|${THREAD_ID}`, '2026-11-01T10:00:00Z|nope']) {
      const res = await callList({ before });
      expect(res.status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
});

describe('listThreadsQuerySchema', () => {
  it('accepts no params and coerces the query-string limit', () => {
    expect(listThreadsQuerySchema.parse({})).toEqual({});
    expect(listThreadsQuerySchema.parse({ limit: '50' })).toEqual({ limit: 50 });
  });

  it('bounds the page size and requires a uuid for threadId', () => {
    expect(listThreadsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(listThreadsQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
    expect(listThreadsQuerySchema.safeParse({ threadId: 'x' }).success).toBe(false);
    expect(listThreadsQuerySchema.safeParse({ slugSuffix: "x' OR 1=1" }).success).toBe(false);
  });
});
