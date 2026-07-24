/**
 * Turn-persistence tests for persistResumedResponse (resume path, WP-B).
 *
 * Focus: the finalize-else-insert switch — a pendingMessageId flips the
 * placeholder row to 'complete' (finalizeAssistantMessage); its absence falls
 * back to createMessage; and a vanished row (finalize miss) is NOT re-inserted
 * and skips the post-persist side effects. threadPersistenceService is mocked
 * so we assert the branch taken rather than hitting Postgres.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMessage = vi.fn();
const finalizeAssistantMessage = vi.fn();
const touchThread = vi.fn();
const setThreadToolContext = vi.fn();

vi.mock('./threadPersistenceService.js', () => ({
  createMessage,
  finalizeAssistantMessage,
  touchThread,
  setThreadToolContext,
}));

const { persistResumedResponse } = await import('./postResponseService.js');

// Minimal ChatGraphState-shaped stub — persistResumedResponse only reads
// intent/searchCount/citations/searchResults/computedResult(+Fresh) off it.
const finalState = {
  intent: 'direct',
  searchCount: 0,
  citations: [],
  searchResults: [],
} as unknown as Parameters<typeof persistResumedResponse>[0]['finalState'];

const base = {
  threadId: 'thread-1',
  fullText: 'Die Antwort.',
  finalState,
  classifiedState: finalState,
};

beforeEach(() => {
  createMessage.mockReset().mockResolvedValue(undefined);
  finalizeAssistantMessage.mockReset().mockResolvedValue(true);
  touchThread.mockReset().mockResolvedValue(undefined);
});

describe('persistResumedResponse turn persistence', () => {
  it('finalizes the placeholder row when pendingMessageId is given', async () => {
    await persistResumedResponse({ ...base, pendingMessageId: 'pending-1' });

    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    const [id, content, metadata] = finalizeAssistantMessage.mock.calls[0];
    expect(id).toBe('pending-1');
    expect(content).toBe('Die Antwort.');
    expect((metadata as { resumed?: boolean }).resumed).toBe(true);
    expect(createMessage).not.toHaveBeenCalled();
    expect(touchThread).toHaveBeenCalledWith('thread-1');
  });

  it('inserts a new message when no pendingMessageId is given', async () => {
    await persistResumedResponse(base);

    expect(createMessage).toHaveBeenCalledTimes(1);
    const [threadId, role, content] = createMessage.mock.calls[0];
    expect(threadId).toBe('thread-1');
    expect(role).toBe('assistant');
    expect(content).toBe('Die Antwort.');
    expect(finalizeAssistantMessage).not.toHaveBeenCalled();
    expect(touchThread).toHaveBeenCalledWith('thread-1');
  });

  it('inserts a new message when pendingMessageId is null (degraded path)', async () => {
    await persistResumedResponse({ ...base, pendingMessageId: null });

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).not.toHaveBeenCalled();
  });

  it('does NOT re-insert and skips side effects when the placeholder vanished', async () => {
    finalizeAssistantMessage.mockResolvedValueOnce(false);

    await persistResumedResponse({ ...base, pendingMessageId: 'pending-gone' });

    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).not.toHaveBeenCalled();
    expect(touchThread).not.toHaveBeenCalled();
  });
});
