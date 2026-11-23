/**
 * The legacy thread-sharing routes stay mounted for shipped mobile binaries.
 * Removing a group share there must close the thread's chat room like the
 * contract router does, or the old path keeps members of that group connected.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server } from 'http';

const { query, closeShareRoom, isThreadOwner } = vi.hoisted(() => ({
  query: vi.fn(),
  closeShareRoom: vi.fn(),
  isThreadOwner: vi.fn(),
}));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../services/collab/collabRooms.js', () => ({ closeShareRoom }));
vi.mock('../../services/groups/groupContent.js', () => ({ notifyContentShared: vi.fn() }));
vi.mock('../../services/groups/groupMembership.js', () => ({
  assertCanShareToGroup: vi.fn(),
  listShareTargetGroups: vi.fn(),
}));
vi.mock('./services/threadAccessService.js', () => ({ isThreadOwner }));
vi.mock('../../utils/keycloak/index.js', async () => {
  const { Router } = await import('express');
  return { createAuthenticatedRouter: () => Router() };
});

const { default: threadSharingRouter } = await import('./threadSharingController.js');

const THREAD_ID = '550e8400-e29b-41d4-a716-446655440001';
const GROUP_ID = '550e8400-e29b-41d4-a716-446655440009';
const OWNER = 'owner-1';

let server: Server;
let baseUrl = '';
let actingUser = OWNER;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: actingUser };
    next();
  });
  app.use('/api/chat-service/threads', threadSharingRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}/api/chat-service/threads`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  actingUser = OWNER;
  closeShareRoom.mockReset().mockResolvedValue(undefined);
  isThreadOwner
    .mockReset()
    .mockImplementation(async (_thread: string, user: string) => user === OWNER);
  query.mockReset().mockImplementation(async (sql: string) => {
    if (/FROM chat_threads/i.test(sql)) return [{ user_id: OWNER }];
    if (/DELETE FROM group_content_shares/i.test(sql)) return [{ id: 'share-1' }];
    return [];
  });
});

const unshare = () => fetch(`${baseUrl}/${THREAD_ID}/groups/${GROUP_ID}`, { method: 'DELETE' });

describe('DELETE /:id/groups/:groupId (legacy)', () => {
  it("closes the thread's chat room after removing the share", async () => {
    const res = await unshare();

    expect(res.status).toBe(200);
    const deleteIndex = query.mock.calls.findIndex(([sql]) =>
      /DELETE FROM group_content_shares/i.test(sql as string)
    );
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(closeShareRoom).toHaveBeenCalledWith('chat_threads', THREAD_ID);
    expect(closeShareRoom.mock.invocationCallOrder[0]).toBeGreaterThan(
      query.mock.invocationCallOrder[deleteIndex] ?? Infinity
    );
  });

  it('closes nothing for a non-owner', async () => {
    actingUser = 'stranger-2';
    expect((await unshare()).status).toBe(403);
    expect(closeShareRoom).not.toHaveBeenCalled();
  });
});

// `chat_threads.user_id` still names the person who started a team chat after
// they left the project; ownership is the rule in `ownsThreadSql`, not the column.
describe('legacy routes for a former project member', () => {
  beforeEach(() => {
    isThreadOwner.mockResolvedValue(false);
  });

  it('refuses to remove a share', async () => {
    expect((await unshare()).status).toBe(403);
    expect(query.mock.calls.some(([sql]) => /DELETE FROM/i.test(sql as string))).toBe(false);
    expect(closeShareRoom).not.toHaveBeenCalled();
  });

  it('refuses to share the thread into another project', async () => {
    const res = await fetch(`${baseUrl}/${THREAD_ID}/groups`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ group_id: GROUP_ID }),
    });
    expect(res.status).toBe(403);
    expect(query.mock.calls.some(([sql]) => /INSERT INTO/i.test(sql as string))).toBe(false);
  });

  it('refuses to list the shares', async () => {
    const res = await fetch(`${baseUrl}/${THREAD_ID}/groups`);
    expect(res.status).toBe(403);
    expect(query.mock.calls.some(([sql]) => /group_content_shares/i.test(sql as string))).toBe(
      false
    );
  });
});
