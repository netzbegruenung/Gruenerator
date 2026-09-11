/**
 * Handler tests for the chat thread sharing contract router.
 *
 * Pins the authorization shape (owner-only management, 404-not-403 on the
 * shared resolve so existence is never confirmed), the group-share upsert
 * (mode switch = same call, permissions JSON carries write:false for
 * Nur lesen), the link-share revoke, and the fork copy statement.
 *
 * PostgresService and threadAccessService are mocked; handlers are called
 * directly on the router object (no HTTP), like shareReadContractRouter.vitest.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const queryMock = vi.fn();
const accessLevelMock = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));

vi.mock('./services/threadAccessService.js', () => ({
  getThreadAccessLevel: accessLevelMock,
}));

const { chatThreadSharingContractRouter } = await import('./chatThreadSharingContractRouter.js');

const THREAD_ID = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_ID = '550e8400-e29b-41d4-a716-446655440009';
const OWNER = 'owner-1';
const VIEWER = 'viewer-1';

const reqAs = (userId: string) => ({ user: { id: userId } }) as unknown as Request;

beforeEach(() => {
  queryMock.mockReset();
  accessLevelMock.mockReset();
});

describe('resolveShared', () => {
  const threadRow = {
    id: THREAD_ID,
    slug_suffix: 'abc234',
    title: 'Klimaplan',
    agent_id: 'gruenerator-universal',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
    share_mode: 'authenticated',
    owner_name: 'Moritz',
  };

  it('resolves a UUID directly (no slug lookup query)', async () => {
    accessLevelMock.mockResolvedValue('read');
    queryMock.mockResolvedValueOnce([threadRow]);

    const res = await chatThreadSharingContractRouter.resolveShared({
      req: reqAs(VIEWER),
      params: { slugOrId: THREAD_ID },
    } as never);

    expect(res.status).toBe(200);
    const body = res.body as { id: string; accessLevel: string; shareMode: string };
    expect(body.id).toBe(THREAD_ID);
    expect(body.accessLevel).toBe('read');
    expect(body.shareMode).toBe('authenticated');
    // Only the metadata query ran — the UUID needed no slug resolution.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('resolves a Notion-style slug via its 6-char suffix', async () => {
    accessLevelMock.mockResolvedValue('read');
    queryMock
      .mockResolvedValueOnce([{ id: THREAD_ID }]) // slug_suffix lookup
      .mockResolvedValueOnce([threadRow]);

    const res = await chatThreadSharingContractRouter.resolveShared({
      req: reqAs(VIEWER),
      params: { slugOrId: 'klimaplan-abc234' },
    } as never);

    expect(res.status).toBe(200);
    const slugCall = queryMock.mock.calls[0];
    expect(slugCall?.[1]).toEqual(['abc234']);
  });

  it("404s (never 403) when access is 'none' — existence stays unconfirmed", async () => {
    accessLevelMock.mockResolvedValue('none');
    queryMock.mockResolvedValueOnce([{ id: THREAD_ID }]);

    const res = await chatThreadSharingContractRouter.resolveShared({
      req: reqAs(VIEWER),
      params: { slugOrId: 'klimaplan-abc234' },
    } as never);

    expect(res.status).toBe(404);
  });

  it('404s on a string that is neither UUID nor valid slug', async () => {
    const res = await chatThreadSharingContractRouter.resolveShared({
      req: reqAs(VIEWER),
      params: { slugOrId: 'not-a-slug!' },
    } as never);

    expect(res.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('shareWithGroup', () => {
  it('404s on a non-UUID threadId without touching the DB (no 22P02 → 500)', async () => {
    const res = await chatThreadSharingContractRouter.shareWithGroup({
      req: reqAs(OWNER),
      params: { threadId: '__LOCALID_abc' },
      body: { groupId: GROUP_ID, mode: 'read' },
    } as never);

    expect(res.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('403s for a non-owner', async () => {
    queryMock.mockResolvedValueOnce([{ user_id: OWNER }]); // ownership check

    const res = await chatThreadSharingContractRouter.shareWithGroup({
      req: reqAs(VIEWER),
      params: { threadId: THREAD_ID },
      body: { groupId: GROUP_ID, mode: 'read' },
    } as never);

    expect(res.status).toBe(403);
  });

  it('403s when the owner is not an active member of the group', async () => {
    queryMock
      .mockResolvedValueOnce([{ user_id: OWNER }]) // ownership
      .mockResolvedValueOnce([]); // membership

    const res = await chatThreadSharingContractRouter.shareWithGroup({
      req: reqAs(OWNER),
      params: { threadId: THREAD_ID },
      body: { groupId: GROUP_ID, mode: 'write' },
    } as never);

    expect(res.status).toBe(403);
  });

  it("writes write:false for mode 'read' via INSERT when no share exists", async () => {
    queryMock
      .mockResolvedValueOnce([{ user_id: OWNER }]) // ownership
      .mockResolvedValueOnce([{ '?column?': 1 }]) // membership
      .mockResolvedValueOnce([]) // UPDATE matched nothing
      .mockResolvedValueOnce([]); // INSERT

    const res = await chatThreadSharingContractRouter.shareWithGroup({
      req: reqAs(OWNER),
      params: { threadId: THREAD_ID },
      body: { groupId: GROUP_ID, mode: 'read' },
    } as never);

    expect(res.status).toBe(200);
    const insertCall = queryMock.mock.calls[3];
    expect(String(insertCall?.[0])).toContain('INSERT INTO group_content_shares');
    // canWrite param is false for Nur lesen.
    expect(insertCall?.[1]).toEqual([THREAD_ID, GROUP_ID, OWNER, false]);
  });

  it('switches an existing share via UPDATE (upsert semantics, no 409)', async () => {
    queryMock
      .mockResolvedValueOnce([{ user_id: OWNER }]) // ownership
      .mockResolvedValueOnce([{ '?column?': 1 }]) // membership
      .mockResolvedValueOnce([{ id: 'share-1' }]); // UPDATE matched

    const res = await chatThreadSharingContractRouter.shareWithGroup({
      req: reqAs(OWNER),
      params: { threadId: THREAD_ID },
      body: { groupId: GROUP_ID, mode: 'write' },
    } as never);

    expect(res.status).toBe(200);
    // No INSERT after a matched UPDATE.
    expect(queryMock).toHaveBeenCalledTimes(3);
    const updateCall = queryMock.mock.calls[2];
    expect(String(updateCall?.[0])).toContain('UPDATE group_content_shares');
    expect(updateCall?.[1]).toEqual([THREAD_ID, GROUP_ID, true]);
  });
});

describe('listGroupShares', () => {
  it("maps write:false to mode 'read' and missing keys to 'write' (legacy)", async () => {
    queryMock
      .mockResolvedValueOnce([{ user_id: OWNER }]) // ownership
      .mockResolvedValueOnce([
        {
          group_id: GROUP_ID,
          group_name: 'KV Musterstadt',
          shared_at: '2026-09-01',
          can_write: false,
        },
        { group_id: 'g2', group_name: 'LAG Klima', shared_at: '2026-09-02', can_write: true },
      ]);

    const res = await chatThreadSharingContractRouter.listGroupShares({
      req: reqAs(OWNER),
      params: { threadId: THREAD_ID },
    } as never);

    expect(res.status).toBe(200);
    const body = res.body as Array<{ mode: string }>;
    expect(body[0]?.mode).toBe('read');
    expect(body[1]?.mode).toBe('write');
  });
});

describe('updateShareMode', () => {
  it('owner sets authenticated and receives the slug for the link', async () => {
    queryMock
      .mockResolvedValueOnce([{ user_id: OWNER }]) // ownership
      .mockResolvedValueOnce([
        { share_mode: 'authenticated', slug_suffix: 'abc234', title: 'Klimaplan' },
      ]);

    const res = await chatThreadSharingContractRouter.updateShareMode({
      req: reqAs(OWNER),
      params: { threadId: THREAD_ID },
      body: { shareMode: 'authenticated' },
    } as never);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      shareMode: 'authenticated',
      slugSuffix: 'abc234',
      title: 'Klimaplan',
    });
  });

  it('403s for a non-owner', async () => {
    queryMock.mockResolvedValueOnce([{ user_id: OWNER }]);

    const res = await chatThreadSharingContractRouter.updateShareMode({
      req: reqAs(VIEWER),
      params: { threadId: THREAD_ID },
      body: { shareMode: 'private' },
    } as never);

    expect(res.status).toBe(403);
  });
});

describe('fork', () => {
  it('404s without any access', async () => {
    accessLevelMock.mockResolvedValue('none');

    const res = await chatThreadSharingContractRouter.fork({
      req: reqAs(VIEWER),
      params: { threadId: THREAD_ID },
      body: {},
    } as never);

    expect(res.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('copies the transcript into a new thread owned by the caller', async () => {
    accessLevelMock.mockResolvedValue('read');
    queryMock
      .mockResolvedValueOnce([{ title: 'Klimaplan', agent_id: 'agent-x', thread_type: 'chat' }])
      .mockResolvedValueOnce([
        { id: 'new-thread', slug_suffix: 'zz9999', title: 'Kopie von Klimaplan' },
      ]);

    const res = await chatThreadSharingContractRouter.fork({
      req: reqAs(VIEWER),
      params: { threadId: THREAD_ID },
      body: {},
    } as never);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      threadId: 'new-thread',
      slugSuffix: 'zz9999',
      title: 'Kopie von Klimaplan',
    });
    const cteCall = queryMock.mock.calls[1];
    const sql = String(cteCall?.[0]);
    expect(sql).toContain('INSERT INTO chat_threads');
    expect(sql).toContain('INSERT INTO chat_messages');
    // New thread belongs to the viewer; source thread feeds the copy.
    const params = cteCall?.[1] as unknown[];
    expect(params[0]).toBe(VIEWER);
    expect(params[5]).toBe(THREAD_ID);
    // Copied rows are forced to status 'complete'.
    expect(sql).toContain("'complete'");
  });

  it('truncates the fork title to 255 characters', async () => {
    accessLevelMock.mockResolvedValue('owner');
    queryMock
      .mockResolvedValueOnce([{ title: 'x'.repeat(300), agent_id: 'a', thread_type: 'chat' }])
      .mockResolvedValueOnce([{ id: 'n', slug_suffix: null, title: 'k' }]);

    await chatThreadSharingContractRouter.fork({
      req: reqAs(OWNER),
      params: { threadId: THREAD_ID },
      body: {},
    } as never);

    const title = (queryMock.mock.calls[1]?.[1] as unknown[])[2] as string;
    expect(title.length).toBe(255);
    expect(title.startsWith('Kopie von ')).toBe(true);
  });
});
