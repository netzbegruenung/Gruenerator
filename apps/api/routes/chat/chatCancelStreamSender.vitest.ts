/**
 * Only the sender may stop a running turn: write access to the thread is not
 * enough — a teammate who can write must not cancel someone else's answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ threadId: 't1' as string | null, senderId: 'ada' }));
const deleted = vi.hoisted((): string[] => []);

vi.mock('../../services/chat/resumableStreams.js', () => ({
  resumableStreams: {
    delete: (id: string) => {
      deleted.push(id);
      return Promise.resolve();
    },
    resume: vi.fn(),
  },
  startStreamRecorder: vi.fn(),
}));
vi.mock('./services/threadAccessService.js', () => ({
  canAccessThread: () => Promise.resolve(true),
  canWriteThread: () => Promise.resolve(true),
}));
vi.mock('./services/threadPersistenceService.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getUser: (req: { user?: { id: string } }) => req.user,
  getAssistantMessageThreadId: () => Promise.resolve(state.threadId),
  isStreamTurnSender: (_streamId: string, userId: string) =>
    Promise.resolve(userId === state.senderId),
}));

const { chatGraphContractRouter } = await import('./chatGraphContractRouter.js');

const cancel = (userId: string) =>
  (
    chatGraphContractRouter.cancelStream as unknown as (a: {
      req: unknown;
      params: { streamId: string };
    }) => Promise<{ status: number }>
  )({ req: { user: { id: userId } }, params: { streamId: 's1' } });

describe('cancelStream: sender only', () => {
  beforeEach(() => {
    deleted.length = 0;
    state.threadId = 't1';
    state.senderId = 'ada';
  });

  it('lets the sender stop the turn', async () => {
    expect((await cancel('ada')).status).toBe(204);
    expect(deleted).toEqual(['s1']);
  });

  it('answers a teammate with 404 and leaves the stream alone', async () => {
    expect((await cancel('bea')).status).toBe(404);
    expect(deleted).toEqual([]);
  });
});
