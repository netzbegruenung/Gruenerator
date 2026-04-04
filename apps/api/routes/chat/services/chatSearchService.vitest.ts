/**
 * ChatSearchService Unit Tests
 *
 * Tests snippet extraction and search result shaping.
 * Uses mocked PostgreSQL to avoid real DB dependency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn().mockResolvedValue([]);

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: mockQuery,
  }),
}));

const { searchChatHistory } = await import('./chatSearchService.js');

describe('searchChatHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no results', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const results = await searchChatHistory('user-1', 'Klimaschutz');
    expect(results).toEqual([]);
  });

  it('constructs correct SQL with ILIKE pattern', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await searchChatHistory('user-1', 'test query');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('ILIKE');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBe('%test query%');
  });

  it('escapes ILIKE special characters in query', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await searchChatHistory('user-1', '100% der_Nutzer');

    const [, params] = mockQuery.mock.calls[0];
    expect(params[1]).toBe('%100\\% der\\_Nutzer%');
  });

  it('deduplicates by thread ID', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        thread_id: 'thread-1',
        thread_title: 'Klimapolitik',
        agent_id: 'universal',
        thread_updated_at: '2026-04-01',
        message_content: 'Wir diskutierten Klimaschutz',
        message_role: 'assistant',
        matched_at: '2026-04-01T10:00:00Z',
      },
      {
        thread_id: 'thread-1',
        thread_title: 'Klimapolitik',
        agent_id: 'universal',
        thread_updated_at: '2026-04-01',
        message_content: 'Ja, Klimaschutz ist wichtig',
        message_role: 'user',
        matched_at: '2026-04-01T09:00:00Z',
      },
      {
        thread_id: 'thread-2',
        thread_title: 'Energiewende',
        agent_id: 'universal',
        thread_updated_at: '2026-03-30',
        message_content: 'Klimaschutz und Energiewende',
        message_role: 'assistant',
        matched_at: '2026-03-30T10:00:00Z',
      },
    ]);

    const results = await searchChatHistory('user-1', 'Klimaschutz');
    expect(results.length).toBe(2);
    expect(results[0].threadId).toBe('thread-1');
    expect(results[1].threadId).toBe('thread-2');
  });

  it('respects limit option', async () => {
    const manyRows = Array.from({ length: 10 }, (_, i) => ({
      thread_id: `thread-${i}`,
      thread_title: `Thread ${i}`,
      agent_id: 'universal',
      thread_updated_at: '2026-04-01',
      message_content: `Content ${i}`,
      message_role: 'assistant',
      matched_at: '2026-04-01T10:00:00Z',
    }));
    mockQuery.mockResolvedValueOnce(manyRows);

    const results = await searchChatHistory('user-1', 'test', { limit: 3 });
    expect(results.length).toBe(3);
  });

  it('includes excludeThreadId in SQL params', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await searchChatHistory('user-1', 'test', { excludeThreadId: 'thread-exclude' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('t.id !=');
    expect(params).toContain('thread-exclude');
  });

  it('includes threadType filter in SQL', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await searchChatHistory('user-1', 'test', { threadType: 'notebook' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('thread_type');
    expect(params).toContain('notebook');
  });

  it('returns snippet with context around match', async () => {
    const longContent = 'A'.repeat(200) + 'MATCH_TARGET' + 'B'.repeat(200);
    mockQuery.mockResolvedValueOnce([
      {
        thread_id: 'thread-1',
        thread_title: 'Test',
        agent_id: 'universal',
        thread_updated_at: '2026-04-01',
        message_content: longContent,
        message_role: 'assistant',
        matched_at: '2026-04-01T10:00:00Z',
      },
    ]);

    const results = await searchChatHistory('user-1', 'MATCH_TARGET');
    expect(results[0].snippet).toContain('MATCH_TARGET');
    expect(results[0].snippet.length).toBeLessThan(longContent.length);
  });

  it('gracefully handles DB errors', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    const results = await searchChatHistory('user-1', 'test');
    expect(results).toEqual([]);
  });
});

const { detectSearchSources } =
  await import('../../../agents/langgraph/ChatGraph/nodes/classifierNode.js');

describe('detectSearchSources: chat_history', () => {
  it('detects "letztes Gespräch" as chat_history source', () => {
    const sources = detectSearchSources('was war im letzten Gespräch über Klimapolitik?', 'search');
    expect(sources).toContain('chat_history');
  });

  it('detects "vorher besprochen" as chat_history source', () => {
    const sources = detectSearchSources(
      'Erinnere dich was wir vorher besprochen haben',
      'research'
    );
    expect(sources).toContain('chat_history');
  });

  it('detects "was haben wir" as chat_history source', () => {
    const sources = detectSearchSources('Was haben wir letzte Woche diskutiert?', 'search');
    expect(sources).toContain('chat_history');
  });

  it('does not detect chat_history for normal search', () => {
    const sources = detectSearchSources('Grüne Position zum Klimaschutz', 'search');
    expect(sources).not.toContain('chat_history');
  });

  it('combines documents + chat_history when party keywords present', () => {
    const sources = detectSearchSources(
      'Was haben wir über die Grünen letztes Gespräch besprochen?',
      'search'
    );
    expect(sources).toContain('chat_history');
    expect(sources).toContain('documents');
  });
});
