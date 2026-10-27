/**
 * The legacy thread-sharing routes stay mounted for shipped mobile binaries.
 * Removing a group share there must close the thread's chat room like the
 * contract router does, or the old path keeps members of that group connected.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server } from 'http';

const { query, closeShareRoom } = vi.hoisted(() => ({
  query: vi.fn(),
  closeShareRoom: vi.fn(),
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
  query.mockReset().mockImplementation(async (sql: string) => {
    if (/FROM chat_threads/i.test(sql)) return [{ user_id: OWNER }];
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
