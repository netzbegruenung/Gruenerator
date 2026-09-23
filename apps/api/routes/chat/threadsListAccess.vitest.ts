/**
 * The thread list's share metadata on the wire.
 *
 * `access_type` was computed in the list SQL for years and then dropped in
 * BOTH mapping stages — `ApiThread.accessType` on the client was declared but
 * always undefined, so shared threads rendered indistinguishable from own
 * ones. These tests pin that `accessType` and `readOnly` now survive the two
 * mappings and validate against `threadSchema`, including the read-only
 * group-share row (`permissions.write = false`) the sidebar routes to the
 * archive view.
 */

import { threadSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Request } from 'express';

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

vi.mock('../../services/chat/threadTitleService.js', () => ({
  generateThreadTitle: vi.fn(),
  threadNeedsTitle: vi.fn(),
}));

// The router imports the groups module, which pulls in better-auth — and
// better-auth calls zod 4's `.meta()`, which the repo's deliberate zod 3 pin
// does not have. Unrelated to this endpoint; cut the import chain.
vi.mock('../auth/groups/index.js', () => ({
  getPostgresAndCheckMembership: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');

const req = { user: { id: 'user-1' }, headers: {}, originalUrl: '/x' } as unknown as Request;

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
    user_id: 'user-1',
    agent_id: 'gruenerator-universal',
    title: 'Klimaplan',
    status: 'regular',
    thread_type: 'chat',
    notebook_collection_id: null,
    group_id: null,
    tags: [],
    slug_suffix: 'abc234',
    access_type: 'owner',
    read_only: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    last_msg_content: 'Hallo',
    last_msg_role: 'user',
    last_msg_created_at: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

async function callList(): Promise<unknown[]> {
  const handler = threadsContractRouter.list as unknown as (args: {
    req: Request;
    query: Record<string, unknown>;
  }) => Promise<{ status: number; body: unknown }>;
  const res = await handler({ req, query: {} });
  expect(res.status).toBe(200);
  return res.body as unknown[];
}

beforeEach(() => {
  query.mockReset();
});

describe('threadsContractRouter.list — share metadata on the wire', () => {
  it('carries accessType/readOnly through both mapping stages and threadSchema', async () => {
    query.mockResolvedValueOnce([
      row({}),
      row({
        id: '550e8400-e29b-41d4-a716-446655440002',
        user_id: 'someone-else',
        access_type: 'group',
        read_only: true,
        slug_suffix: 'zz9999',
      }),
    ]);

    const body = await callList();
    const parsed = z.array(threadSchema).parse(body);

    expect(parsed[0]?.accessType).toBe('owner');
    expect(parsed[0]?.readOnly).toBe(false);
    expect(parsed[1]?.accessType).toBe('group');
    expect(parsed[1]?.readOnly).toBe(true);
  });

  it('emits the read-only flag from the SQL (read_only column), not a default', async () => {
    query.mockResolvedValueOnce([
      row({ user_id: 'someone-else', access_type: 'group', read_only: true }),
    ]);

    const body = (await callList()) as Array<{ readOnly?: boolean }>;
    expect(body[0]?.readOnly).toBe(true);

    // The list SQL must compute read_only and filter unreadable shares.
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('read_only');
    expect(sql).toContain("COALESCE((gcs.permissions->>'read')::boolean, true)");
  });
});
