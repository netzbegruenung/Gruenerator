/**
 * Pins the terminal wire format shared by the five edit/loop turn services.
 *
 * These used to be five hand-maintained copies. The retry policy and the
 * persist_failed warning are the parts that must not drift: a silent persist
 * failure lets the client's view and the stored history diverge.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMessage = vi.fn();
const touchThread = vi.fn();
const sendChatWarning = vi.fn();

vi.mock('./threadPersistenceService.js', () => ({
  createMessage: (...args: unknown[]) => createMessage(...args),
  touchThread: (...args: unknown[]) => touchThread(...args),
}));

vi.mock('./sseHelpers.js', () => ({
  sendChatWarning: (...args: unknown[]) => sendChatWarning(...args),
}));

const { finishEditTurn } = await import('./editTurnCompletion.js');

function makeSse() {
  return { send: vi.fn(), sendRaw: vi.fn(), end: vi.fn() };
}

const base = {
  text: 'Fertig.',
  intent: 'reel_edit',
  persistLabel: 'reelEdit:persist',
  logPrefix: '[ReelEdit]',
  startTime: Date.now() - 1000,
};

beforeEach(() => {
  vi.clearAllMocks();
  createMessage.mockResolvedValue(undefined);
  touchThread.mockResolvedValue(undefined);
});

describe('finishEditTurn', () => {
  it('streams the reply, emits done, persists and closes', async () => {
    const sse = makeSse();
    await finishEditTurn({ ...base, sse: sse as never, threadId: 't1' });

    expect(sse.send).toHaveBeenCalledWith('response_start', expect.anything());
    expect(sse.send).toHaveBeenCalledWith('text_delta', { text: 'Fertig.' });

    const [event, payload] = sse.sendRaw.mock.calls[0];
    expect(event).toBe('done');
    expect(payload).toMatchObject({
      threadId: 't1',
      citations: [],
      metadata: { intent: 'reel_edit', searchCount: 0, searchTimeMs: 0 },
    });
    expect(payload.metadata.totalTimeMs).toBeGreaterThan(0);

    expect(createMessage).toHaveBeenCalledWith('t1', 'assistant', 'Fertig.', {
      intent: 'reel_edit',
    });
    expect(touchThread).toHaveBeenCalledWith('t1');
    expect(sse.end).toHaveBeenCalled();
  });

  it('skips response_start/text_delta when the caller already streamed', async () => {
    const sse = makeSse();
    await finishEditTurn({ ...base, sse: sse as never, threadId: 't1', streamed: true });

    expect(sse.send).not.toHaveBeenCalled();
    expect(sse.sendRaw).toHaveBeenCalledWith('done', expect.anything());
    expect(sse.end).toHaveBeenCalled();
  });

  it('warns and still closes when persisting fails', async () => {
    const sse = makeSse();
    createMessage.mockRejectedValue(new Error('db down'));

    await finishEditTurn({ ...base, sse: sse as never, threadId: 't1' });

    expect(sendChatWarning).toHaveBeenCalledWith(sse, 'persist_failed');
    expect(sse.end).toHaveBeenCalled();
  });

  it('emits done but skips persistence without a thread', async () => {
    const sse = makeSse();
    await finishEditTurn({ ...base, sse: sse as never, threadId: null });

    expect(sse.sendRaw).toHaveBeenCalledWith('done', expect.anything());
    expect(createMessage).not.toHaveBeenCalled();
    expect(touchThread).not.toHaveBeenCalled();
    expect(sse.end).toHaveBeenCalled();
  });

  it('carries toolCalls and a computed searchCount', async () => {
    const sse = makeSse();
    const toolCalls = [{ toolCallId: 'tc_1', toolName: 'reel_edit' }];
    await finishEditTurn({
      ...base,
      sse: sse as never,
      threadId: 't1',
      toolCalls,
      searchCount: 3,
    });

    expect(sse.sendRaw.mock.calls[0][1].metadata.searchCount).toBe(3);
    expect(createMessage).toHaveBeenCalledWith('t1', 'assistant', 'Fertig.', {
      intent: 'reel_edit',
      toolCalls,
    });
  });

  it('omits an empty toolCalls array from the persisted metadata', async () => {
    const sse = makeSse();
    await finishEditTurn({ ...base, sse: sse as never, threadId: 't1', toolCalls: [] });

    expect(createMessage).toHaveBeenCalledWith('t1', 'assistant', 'Fertig.', {
      intent: 'reel_edit',
    });
  });
});
