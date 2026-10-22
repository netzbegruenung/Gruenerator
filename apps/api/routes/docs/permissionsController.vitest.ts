/**
 * Changing or revoking one user's document permission closes that user's open
 * Hocuspocus connections after the write — Hocuspocus checks access only when
 * a connection is set up, so the open session would otherwise keep its rights.
 */
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server } from 'http';

const { query, closeCollabRooms } = vi.hoisted(() => ({
  query: vi.fn(),
  closeCollabRooms: vi.fn(),
}));

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('../../services/collab/hocuspocusInternal.js', () => ({ closeCollabRooms }));
vi.mock('../../services/docs/docPreview.js', () => ({ getDocPreview: vi.fn() }));
vi.mock('../../services/notifications/index.js', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

const { default: permissionsRouter } = await import('./permissionsController.js');

const OWNER = 'owner-1';
const TARGET = 'user-b';

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
  app.use('/api/docs', permissionsRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}/api/docs`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  actingUser = OWNER;
  closeCollabRooms.mockReset().mockResolvedValue(undefined);
  query.mockReset().mockImplementation(async (sql: string) => {
    if (/^\s*UPDATE/i.test(sql)) return [];
    if (/FROM collaborative_documents/i.test(sql)) {
      return [
        {
          created_by: OWNER,
          title: 'Antrag',
          permissions: { [TARGET]: { level: 'editor', granted_at: '2026-10-01T00:00:00Z' } },
        },
      ];
    }
    return [];
  });
});

const updateOrder = () => {
  const i = query.mock.calls.findIndex(([sql]) => /^\s*UPDATE/i.test(sql as string));
  return query.mock.invocationCallOrder[i] ?? Infinity;
};

const changeLevel = (level: string) =>
  fetch(`${baseUrl}/doc-1/permissions/${TARGET}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ permission_level: level }),
  });

const revoke = (target = TARGET) =>
  fetch(`${baseUrl}/doc-1/permissions/${target}`, { method: 'DELETE' });

describe('document permission changes and open collaboration connections', () => {
  it("revoking closes the user's connections after the write", async () => {
    const res = await revoke();

    expect(res.status).toBe(200);
    expect(closeCollabRooms).toHaveBeenCalledWith(['doc-1'], TARGET);
    expect(closeCollabRooms.mock.invocationCallOrder[0]).toBeGreaterThan(updateOrder());
  });

  it("changing the level closes the user's connections after the write", async () => {
    const res = await changeLevel('viewer');

    expect(res.status).toBe(200);
    expect(closeCollabRooms).toHaveBeenCalledWith(['doc-1'], TARGET);
    expect(closeCollabRooms.mock.invocationCallOrder[0]).toBeGreaterThan(updateOrder());
  });

  it('closes nothing when a non-owner tries', async () => {
    actingUser = 'stranger-2';
    expect((await revoke()).status).toBe(403);
    expect((await changeLevel('viewer')).status).toBe(403);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  it('closes nothing when the creator would be revoked', async () => {
    expect((await revoke(OWNER)).status).toBe(400);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  it('does not hold the response for the close', async () => {
    closeCollabRooms.mockReturnValue(new Promise(() => {}));
    expect((await revoke()).status).toBe(200);
  });
});
