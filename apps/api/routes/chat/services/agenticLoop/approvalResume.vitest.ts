import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('../toolApprovalStateStore.js', () => ({
  toolApprovalStateStore: { get: (...a: unknown[]) => get(...a) },
}));

const expirePendingApproval = vi.fn();
vi.mock('../threadPersistenceService.js', () => ({
  expirePendingApproval: (...a: unknown[]) => expirePendingApproval(...a),
  finalizeAssistantMessage: vi.fn(),
  touchThread: vi.fn(),
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { runToolApprovalResume } = await import('./approvalResume.js');

describe('runToolApprovalResume — expired pause state', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(null);
    expirePendingApproval.mockReset().mockResolvedValue(undefined);
  });

  const run = (fail = vi.fn((message: string) => ({ message }))) =>
    runToolApprovalResume({
      req: {} as never,
      sse: {} as never,
      threadId: 't1',
      userId: 'u1',
      decisions: [{ toolCallId: 'c1', approved: true }],
      fail: fail as never,
    });

  it('marks the stored card expired so it stops being clickable', async () => {
    const fail = vi.fn((message: string) => ({ message }));
    await run(fail);

    expect(expirePendingApproval).toHaveBeenCalledWith('t1', 'u1');
    expect(fail).toHaveBeenCalledWith(
      'Die Freigabe ist abgelaufen. Bitte stelle die Anfrage noch einmal.',
      'invalid_request'
    );
  });

  it('still answers "abgelaufen" when marking the card fails', async () => {
    expirePendingApproval.mockRejectedValue(new Error('db down'));
    const fail = vi.fn((message: string) => ({ message }));
    await run(fail);

    expect(fail).toHaveBeenCalledTimes(1);
  });
});
