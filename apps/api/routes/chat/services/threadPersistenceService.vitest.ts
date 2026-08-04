/**
 * SQL-shape tests for the turn-persistence functions on threadPersistenceService
 * (WP-B). The Postgres instance is mocked, so each test asserts the exact query
 * shape (guards, RETURNING) and bind parameters rather than hitting a DB.
 *
 * Also a regression guard that deleteTrailingAssistant still keys off the
 * MAX(created_at) user-message subquery — the created_at range must keep
 * catching the new placeholder rows, so its SQL must not drift.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));

const {
  createMessage,
  createPendingAssistantMessage,
  updatePendingAssistantText,
  finalizeAssistantMessage,
  discardPendingAssistantIfEmpty,
  deleteEmptyStreamingRows,
  deleteTrailingAssistant,
} = await import('./threadPersistenceService.js');

/** Collapse whitespace so assertions don't depend on SQL formatting. */
const sql = (): string => (queryMock.mock.calls.at(-1)?.[0] as string).replace(/\s+/g, ' ').trim();
const params = (): unknown[] => queryMock.mock.calls.at(-1)?.[1] as unknown[];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

describe('createMessage', () => {
  it('returns the persisted message id for attachment linking', async () => {
    queryMock.mockResolvedValueOnce([{ id: 'user-message-1' }]);

    await expect(createMessage('thread-1', 'user', 'Hallo', undefined, 'user-1')).resolves.toBe(
      'user-message-1'
    );
    expect(sql()).toContain('RETURNING id');
    expect(params()).toEqual(['thread-1', 'user', 'Hallo', null, 'user-1']);
  });
});

describe('createPendingAssistantMessage', () => {
  it('inserts an empty streaming assistant row and returns its id', async () => {
    queryMock.mockResolvedValueOnce([{ id: 'new-id' }]);
    const id = await createPendingAssistantMessage('thread-1', 'user-1');

    expect(id).toBe('new-id');
    const q = sql();
    expect(q).toContain('INSERT INTO chat_messages');
    expect(q).toContain("'assistant'");
    expect(q).toContain('NULL');
    expect(q).toContain("'streaming'");
    expect(q).toContain('RETURNING id');
    expect(params()).toEqual(['thread-1', 'user-1']);
  });

  it('passes null user id when omitted', async () => {
    queryMock.mockResolvedValueOnce([{ id: 'x' }]);
    await createPendingAssistantMessage('thread-1');
    expect(params()).toEqual(['thread-1', null]);
  });
});

describe('updatePendingAssistantText', () => {
  it('updates content guarded on status = streaming', async () => {
    await updatePendingAssistantText('msg-1', 'partial text');
    const q = sql();
    expect(q).toContain('UPDATE chat_messages SET content = $2');
    expect(q).toContain('WHERE id = $1');
    expect(q).toContain("status = 'streaming'");
    expect(params()).toEqual(['msg-1', 'partial text']);
  });
});

describe('finalizeAssistantMessage', () => {
  it('sets content + tool_results, flips to complete, returns true on a match', async () => {
    queryMock.mockResolvedValueOnce([{ id: 'msg-1' }]);
    const ok = await finalizeAssistantMessage('msg-1', 'final', { intent: 'direct' });

    expect(ok).toBe(true);
    const q = sql();
    expect(q).toContain('UPDATE chat_messages');
    expect(q).toContain('content = $2');
    expect(q).toContain('tool_results = $3');
    expect(q).toContain("status = 'complete'");
    expect(q).toContain('WHERE id = $1');
    expect(q).toContain('RETURNING id');
    expect(params()).toEqual(['msg-1', 'final', JSON.stringify({ intent: 'direct' })]);
  });

  it('returns false when no row matched (row was deleted)', async () => {
    queryMock.mockResolvedValueOnce([]);
    const ok = await finalizeAssistantMessage('gone', 'final');
    expect(ok).toBe(false);
    // null content + null metadata are passed through explicitly.
    expect(params()).toEqual(['gone', 'final', null]);
  });

  it('passes null content through', async () => {
    queryMock.mockResolvedValueOnce([{ id: 'm' }]);
    await finalizeAssistantMessage('m', null, { generatedImage: true });
    expect(params()?.[1]).toBeNull();
  });
});

describe('discardPendingAssistantIfEmpty', () => {
  it('deletes only an empty streaming row', async () => {
    await discardPendingAssistantIfEmpty('msg-1');
    const q = sql();
    expect(q).toContain('DELETE FROM chat_messages');
    expect(q).toContain('WHERE id = $1');
    expect(q).toContain("status = 'streaming'");
    expect(q).toContain("content IS NULL OR content = ''");
    expect(params()).toEqual(['msg-1']);
  });
});

describe('deleteEmptyStreamingRows', () => {
  it('sweeps empty streaming assistant orphans of a thread', async () => {
    await deleteEmptyStreamingRows('thread-1');
    const q = sql();
    expect(q).toContain('DELETE FROM chat_messages');
    expect(q).toContain('thread_id = $1');
    expect(q).toContain("role = 'assistant'");
    expect(q).toContain("status = 'streaming'");
    expect(q).toContain("content IS NULL OR content = ''");
    expect(params()).toEqual(['thread-1']);
  });
});

describe('deleteTrailingAssistant (regression)', () => {
  it('still keys off the MAX(created_at) user-message subquery', async () => {
    queryMock.mockResolvedValueOnce([]);
    await deleteTrailingAssistant('thread-1');
    const q = sql();
    expect(q).toContain('MAX(created_at)');
    expect(q).toContain("role = 'user'");
    expect(params()).toEqual(['thread-1']);
  });
});
