/**
 * Handler tests for the threads contract router's `update`.
 *
 * These pin the one invariant a shape test cannot see: the `chat_thread_recall`
 * Qdrant collection holds a point for exactly the regular threads, and `update`
 * is the only writer of `chat_threads.status`. Both directions have to be
 * carried here — archive deletes the point, unarchive rebuilds it. Half of it
 * is worse than none: deleting on archive without the rebuild makes an
 * unarchived thread permanently invisible to semantic recall, because
 * `upsertThreadRecallPoint` refuses archived threads and nothing else re-runs
 * it. See #3323.
 *
 * PostgresService and the recall service are mocked; handlers are called
 * directly on the router object (no HTTP), like chatThreadSharingContractRouter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const queryMock = vi.fn();
const deleteRecallPoint = vi.fn<(threadId: string) => Promise<void>>();
const upsertRecallPoint = vi.fn<(threadId: string) => Promise<void>>();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));

vi.mock('../../services/chat/threadRecallEmbeddingService.js', () => ({
  deleteThreadRecallPoint: (threadId: string) => deleteRecallPoint(threadId),
  upsertThreadRecallPoint: (threadId: string) => upsertRecallPoint(threadId),
}));

vi.mock('../../services/chat/threadTitleService.js', () => ({
  generateThreadTitle: vi.fn(),
  threadNeedsTitle: vi.fn(),
}));

vi.mock('../auth/groups/index.js', () => ({ getPostgresAndCheckMembership: vi.fn() }));

vi.mock('./services/attachmentPersistenceService.js', () => ({
  deleteThreadAttachmentVectors: vi.fn(),
  getThreadTabularFiles: vi.fn(),
}));

vi.mock('./services/threadPersistenceService.js', () => ({
  getThreadSettings: vi.fn(),
  insertThreadWithSlugRetry: vi.fn(),
  updateThreadSettings: vi.fn(),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');

const THREAD_ID = '550e8400-e29b-41d4-a716-446655440001';
const OWNER = 'owner-1';

const req = { user: { id: OWNER } } as unknown as Request;

/** Ownership SELECT, then the UPDATE … RETURNING row. */
function givenStatusChange(from: string, to: string) {
  queryMock
    .mockResolvedValueOnce([{ id: THREAD_ID, user_id: OWNER, status: from }])
    .mockResolvedValueOnce([
      {
        id: THREAD_ID,
        user_id: OWNER,
        agent_id: 'gruenerator-universal',
        title: 'Klimaplan',
        status: to,
        created_at: new Date('2026-09-01T00:00:00Z'),
        updated_at: new Date('2026-09-02T00:00:00Z'),
      },
    ]);
}

function update(body: Record<string, unknown>) {
  return threadsContractRouter.update({ req, body: { threadId: THREAD_ID, ...body } } as never);
}

beforeEach(() => {
  queryMock.mockReset();
  deleteRecallPoint.mockReset().mockResolvedValue(undefined);
  upsertRecallPoint.mockReset().mockResolvedValue(undefined);
});

describe('update — thread recall point follows the archive state', () => {
  it('drops the recall point when a thread is archived', async () => {
    givenStatusChange('regular', 'archived');

    const res = await update({ status: 'archived' });

    expect(res.status).toBe(200);
    expect(deleteRecallPoint).toHaveBeenCalledWith(THREAD_ID);
    expect(upsertRecallPoint).not.toHaveBeenCalled();
  });

  it('rebuilds the recall point when a thread is unarchived', async () => {
    // The half-fix this guards against: delete on archive, nothing on the way
    // back. `upsertThreadRecallPoint` refuses archived threads, so without this
    // call the thread never returns to semantic recall.
    givenStatusChange('archived', 'regular');

    const res = await update({ status: 'regular' });

    expect(res.status).toBe(200);
    expect(upsertRecallPoint).toHaveBeenCalledWith(THREAD_ID);
    expect(deleteRecallPoint).not.toHaveBeenCalled();
  });

  it('leaves Qdrant alone when the status did not change', async () => {
    // A rename must not cost a Mistral embedding round-trip, and re-writing
    // `status = 'regular'` over itself is not a transition.
    givenStatusChange('regular', 'regular');

    await update({ title: 'Neuer Titel' });

    expect(upsertRecallPoint).not.toHaveBeenCalled();
    expect(deleteRecallPoint).not.toHaveBeenCalled();
  });

  it('still answers 200 when the recall sync fails', async () => {
    // Fire-and-forget by design: archiving is a Postgres fact, and a Qdrant or
    // Mistral outage must not turn it into a failed request.
    givenStatusChange('regular', 'archived');
    deleteRecallPoint.mockRejectedValue(new Error('qdrant unreachable'));

    const res = await update({ status: 'archived' });

    expect(res.status).toBe(200);
  });
});
