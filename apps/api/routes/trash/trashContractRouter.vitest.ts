/**
 * HTTP-level tests for `/api/trash` with the registry mocked. They go through
 * a real Express app so the contract's own validation (unknown kind → 400) is
 * part of what is tested, not just the handlers.
 */
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import { type TrashItem } from '@gruenerator/contracts';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type TrashKindHandler } from '../../services/trash/trashRegistry.js';

const handler = {
  listTrashed: vi.fn<TrashKindHandler['listTrashed']>(),
  getTrashed: vi.fn<TrashKindHandler['getTrashed']>(),
  trash: vi.fn<TrashKindHandler['trash']>(),
  restore: vi.fn<TrashKindHandler['restore']>(),
  purge: vi.fn<TrashKindHandler['purge']>(),
  listExpired: vi.fn<TrashKindHandler['listExpired']>(),
};
const other = { ...handler, listTrashed: vi.fn<TrashKindHandler['listTrashed']>() };

vi.mock('../../services/trash/trashRegistry.js', () => ({
  TRASH_KINDS: { collaborative_document: handler, chat_thread: other },
  trashHandlerFor: (kind: string) =>
    kind === 'collaborative_document' ? handler : kind === 'chat_thread' ? other : null,
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { mountTrashContractRouter } = await import('./trashContractRouter.js');

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { id: string } }).user = { id: 'user-1' };
    next();
  });
  mountTrashContractRouter(app);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  for (const fn of [...Object.values(handler), other.listTrashed]) fn.mockReset();
  handler.listTrashed.mockResolvedValue([]);
  other.listTrashed.mockResolvedValue([]);
});

function item(
  id: string,
  deletedAt: string,
  kind: TrashItem['kind'] = 'collaborative_document'
): TrashItem {
  return { kind, id, title: id, subtype: null, deletedAt, purgeAt: deletedAt };
}

async function call(method: string, path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, { method });
  return { status: res.status, body: await res.json() };
}

describe('validation and routing', () => {
  it('rejects an unknown kind with 400 from the contract', async () => {
    expect((await call('POST', '/api/trash/reel/abc/restore')).status).toBe(400);
    expect((await call('GET', '/api/trash?kind=reel')).status).toBe(400);
    expect(handler.getTrashed).not.toHaveBeenCalled();
  });

  it('answers 404 for a known kind without a handler yet', async () => {
    expect((await call('POST', '/api/trash/group/abc/restore')).status).toBe(404);
    expect((await call('DELETE', '/api/trash/group/abc')).status).toBe(404);
    expect((await call('GET', '/api/trash?kind=group')).status).toBe(404);
  });
});

describe('restore', () => {
  it('404 when the item is not in the trash', async () => {
    handler.getTrashed.mockResolvedValue('not_found');
    expect((await call('POST', '/api/trash/collaborative_document/d1/restore')).status).toBe(404);
    expect(handler.restore).not.toHaveBeenCalled();
  });

  it('403 without delete rights, and nothing is restored', async () => {
    handler.getTrashed.mockResolvedValue('forbidden');
    expect((await call('POST', '/api/trash/collaborative_document/d1/restore')).status).toBe(403);
    expect(handler.restore).not.toHaveBeenCalled();
  });

  it('409 on a conflict, reported or thrown as 23505', async () => {
    handler.getTrashed.mockResolvedValue(item('d1', '2026-09-01T00:00:00.000Z'));
    handler.restore.mockResolvedValueOnce('conflict');
    expect((await call('POST', '/api/trash/collaborative_document/d1/restore')).status).toBe(409);

    handler.restore.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    expect((await call('POST', '/api/trash/collaborative_document/d1/restore')).status).toBe(409);
  });

  it('200 with the item it restored', async () => {
    const restored = item('d1', '2026-09-01T00:00:00.000Z');
    handler.getTrashed.mockResolvedValue(restored);
    handler.restore.mockResolvedValue('ok');
    const res = await call('POST', '/api/trash/collaborative_document/d1/restore');
    expect(res).toEqual({ status: 200, body: restored });
    expect(handler.restore).toHaveBeenCalledWith('user-1', 'd1');
  });
});

describe('purge now', () => {
  it('checks rights before purging', async () => {
    handler.getTrashed.mockResolvedValue('forbidden');
    expect((await call('DELETE', '/api/trash/collaborative_document/d1')).status).toBe(403);
    expect(handler.purge).not.toHaveBeenCalled();

    handler.getTrashed.mockResolvedValue(item('d1', '2026-09-01T00:00:00.000Z'));
    expect(await call('DELETE', '/api/trash/collaborative_document/d1')).toEqual({
      status: 200,
      body: { purged: 1 },
    });
    expect(handler.purge).toHaveBeenCalledWith('d1');
  });
});

describe('list', () => {
  it('merges kinds newest first and pages with a cursor', async () => {
    handler.listTrashed.mockResolvedValue([
      item('d3', '2026-09-03T00:00:00.000Z'),
      item('d1', '2026-09-01T00:00:00.000Z'),
    ]);
    other.listTrashed.mockResolvedValue([item('t2', '2026-09-02T00:00:00.000Z', 'chat_thread')]);

    const first = await call('GET', '/api/trash?limit=2');
    expect(first.status).toBe(200);
    const body = first.body as { items: TrashItem[]; nextCursor: string | null };
    expect(body.items.map((i) => i.id)).toEqual(['d3', 't2']);
    expect(body.nextCursor).not.toBeNull();
    expect(handler.listTrashed).toHaveBeenCalledWith('user-1', { limit: 3, before: null });

    handler.listTrashed.mockResolvedValue([item('d1', '2026-09-01T00:00:00.000Z')]);
    other.listTrashed.mockResolvedValue([]);
    const second = await call('GET', `/api/trash?limit=2&cursor=${body.nextCursor}`);
    expect((second.body as { items: TrashItem[] }).items.map((i) => i.id)).toEqual(['d1']);
    expect((second.body as { nextCursor: string | null }).nextCursor).toBeNull();
    expect(handler.listTrashed).toHaveBeenLastCalledWith('user-1', {
      limit: 3,
      before: { deletedAt: '2026-09-02T00:00:00.000Z', id: 't2' },
    });
  });

  it('asks only the filtered kind', async () => {
    await call('GET', '/api/trash?kind=chat_thread');
    expect(other.listTrashed).toHaveBeenCalled();
    expect(handler.listTrashed).not.toHaveBeenCalled();
  });

  it('rejects a malformed cursor', async () => {
    expect((await call('GET', '/api/trash?cursor=nope')).status).toBe(400);
  });
});

describe('empty', () => {
  it('purges everything the user has in the trash', async () => {
    handler.listTrashed.mockResolvedValueOnce([
      item('d2', '2026-09-02T00:00:00.000Z'),
      item('d1', '2026-09-01T00:00:00.000Z'),
    ]);
    other.listTrashed.mockResolvedValueOnce([
      item('t1', '2026-09-01T00:00:00.000Z', 'chat_thread'),
    ]);

    expect(await call('DELETE', '/api/trash')).toEqual({ status: 200, body: { purged: 3 } });
    expect(handler.purge.mock.calls).toEqual([['d2'], ['d1'], ['t1']]);
  });
});
