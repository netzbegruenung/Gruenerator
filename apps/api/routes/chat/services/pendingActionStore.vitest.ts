/**
 * PendingActionStore Unit Tests
 *
 * Tests the Redis-backed store for pending confirmation actions.
 * Uses mocked Redis client to avoid real Redis dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';

vi.mock('../../../utils/redis/client.js', () => ({
  default: {
    setEx: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  },
}));

const mockRedis = (await import('../../../utils/redis/client.js')).default;

const { pendingActionStore } = await import('./pendingActionStore.js');

const SAMPLE_ACTION: PendingAction = {
  actionId: 'action_123',
  type: 'save_as_doc',
  threadId: 'thread-abc',
  userId: 'user-xyz',
  title: 'Dokument erstellen',
  preview: 'Die Grünen setzen sich für...',
  payload: { content: '<p>Full content</p>', title: 'Klimapolitik', subtype: 'docs' },
  createdAt: 1712188800000,
};

describe('pendingActionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('store', () => {
    it('stores action in Redis with correct key and TTL', async () => {
      await pendingActionStore.store(SAMPLE_ACTION);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'pending_action:thread-abc:action_123',
        300,
        expect.any(String)
      );

      const storedJson = (mockRedis.setEx as any).mock.calls[0][2];
      const parsed = JSON.parse(storedJson);
      expect(parsed.actionId).toBe('action_123');
      expect(parsed.type).toBe('save_as_doc');
      expect(parsed.userId).toBe('user-xyz');
    });

    it('stores all ConfirmActionType values', async () => {
      const types = ['save_as_doc', 'modify_doc', 'modify_board'] as const;
      for (const type of types) {
        const action = { ...SAMPLE_ACTION, type, actionId: `action_${type}` };
        await pendingActionStore.store(action);
        expect(mockRedis.setEx).toHaveBeenCalled();
      }
    });
  });

  describe('get', () => {
    it('returns parsed action when found', async () => {
      (mockRedis.get as any).mockResolvedValueOnce(JSON.stringify(SAMPLE_ACTION));

      const result = await pendingActionStore.get('thread-abc', 'action_123');

      expect(mockRedis.get).toHaveBeenCalledWith('pending_action:thread-abc:action_123');
      expect(result).toEqual(SAMPLE_ACTION);
    });

    it('returns null when not found', async () => {
      (mockRedis.get as any).mockResolvedValueOnce(null);

      const result = await pendingActionStore.get('thread-abc', 'missing');

      expect(result).toBeNull();
    });

    it('returns null on Redis error', async () => {
      (mockRedis.get as any).mockRejectedValueOnce(new Error('Redis down'));

      const result = await pendingActionStore.get('thread-abc', 'action_123');

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes the correct key', async () => {
      await pendingActionStore.delete('thread-abc', 'action_123');

      expect(mockRedis.del).toHaveBeenCalledWith('pending_action:thread-abc:action_123');
    });
  });
});

describe('PendingAction payload shapes', () => {
  it('save_as_doc payload has content, title, subtype', () => {
    const action: PendingAction = {
      ...SAMPLE_ACTION,
      type: 'save_as_doc',
      payload: { content: '<p>text</p>', title: 'My Doc', subtype: 'pressemitteilung' },
    };
    expect(action.payload.content).toBeDefined();
    expect(action.payload.title).toBeDefined();
  });

  it('modify_doc payload has docId and newContent', () => {
    const action: PendingAction = {
      ...SAMPLE_ACTION,
      type: 'modify_doc',
      payload: { docId: 'doc-123', newContent: '<p>updated</p>' },
    };
    expect(action.payload.docId).toBe('doc-123');
  });

  it('modify_board payload has boardId and rows', () => {
    const action: PendingAction = {
      ...SAMPLE_ACTION,
      type: 'modify_board',
      payload: {
        boardId: 'board-456',
        rows: [{ title: 'New Task', status: 'To Do' }],
        responseText: 'Add task to board',
      },
    };
    expect(action.payload.boardId).toBe('board-456');
    expect(Array.isArray(action.payload.rows)).toBe(true);
  });
});
