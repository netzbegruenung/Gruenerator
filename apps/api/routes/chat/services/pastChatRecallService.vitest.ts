/**
 * PastChatRecallService Unit Tests
 *
 * Covers the keyword/semantic merge, the deep-read fallback (summary vs last-N),
 * ownership scoping, and the German prompt block formatter. DB + embedding
 * dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ChatSearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const mockQuery = vi.fn().mockResolvedValue([]);
const mockSearchChatHistory = vi.fn();
const mockSearchThreadRecall = vi.fn();
const mockSearchOfficeContent = vi.fn();
const mockRerankPipeline = vi.fn();

vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

vi.mock('./chatSearchService.js', () => ({
  searchChatHistory: (...args: unknown[]) => mockSearchChatHistory(...args),
}));

vi.mock('../../../services/chat/threadRecallEmbeddingService.js', () => ({
  searchThreadRecall: (...args: unknown[]) => mockSearchThreadRecall(...args),
}));

vi.mock('../../docs/docsSearch.js', () => ({
  searchOfficeContent: (...args: unknown[]) => mockSearchOfficeContent(...args),
}));

vi.mock('../../../services/search/rerankPipeline.js', () => ({
  rerankPipeline: (...args: unknown[]) => mockRerankPipeline(...args),
}));

const {
  recallPastChats,
  recallOfficeDocuments,
  rerankRecall,
  getThreadRecallContext,
  formatPastChatsBlock,
  formatOfficeDocsBlock,
} = await import('./pastChatRecallService.js');

function makeHit(id: string, title: string): ChatSearchResult {
  return {
    threadId: id,
    threadTitle: title,
    threadSlugSuffix: 'abc123',
    agentId: 'universal',
    snippet: `snippet for ${title}`,
    messageRole: 'assistant',
    matchedAt: '2026-04-01T10:00:00Z',
    threadUpdatedAt: '2026-04-01T10:00:00Z',
  };
}

describe('recallPastChats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchChatHistory.mockResolvedValue([]);
    mockSearchThreadRecall.mockResolvedValue([]);
    mockQuery.mockResolvedValue([]);
  });

  it('scopes the keyword search to owned threads', async () => {
    await recallPastChats('user-1', 'Newsletter');
    const opts = mockSearchChatHistory.mock.calls[0][2];
    expect(opts.ownedOnly).toBe(true);
  });

  it('keeps keyword hits first, then appends semantic-only extras', async () => {
    mockSearchChatHistory.mockResolvedValue([makeHit('t-kw', 'Keyword Thread')]);
    mockSearchThreadRecall.mockResolvedValue(['t-kw', 't-sem']);
    mockQuery.mockResolvedValue([
      {
        thread_id: 't-sem',
        thread_title: 'Semantic Thread',
        agent_id: 'universal',
        thread_slug_suffix: 'sem999',
        thread_updated_at: '2026-03-01T10:00:00Z',
        compaction_summary: null,
        snippet_content: 'a semantic snippet',
      },
    ]);

    const results = await recallPastChats('user-1', 'Newsletter', { limit: 5 });
    expect(results.map((r) => r.threadId)).toEqual(['t-kw', 't-sem']);
  });

  it('falls back to keyword-only when semantic search throws', async () => {
    mockSearchChatHistory.mockResolvedValue([makeHit('t-kw', 'Keyword Thread')]);
    mockSearchThreadRecall.mockRejectedValue(new Error('qdrant down'));

    const results = await recallPastChats('user-1', 'Newsletter');
    expect(results.map((r) => r.threadId)).toEqual(['t-kw']);
  });

  it('respects the limit across merged sources', async () => {
    mockSearchChatHistory.mockResolvedValue([makeHit('t-1', 'One'), makeHit('t-2', 'Two')]);
    mockSearchThreadRecall.mockResolvedValue(['t-3']);
    mockQuery.mockResolvedValue([
      {
        thread_id: 't-3',
        thread_title: 'Three',
        agent_id: 'universal',
        thread_slug_suffix: 's3',
        thread_updated_at: '2026-03-01T10:00:00Z',
        compaction_summary: null,
        snippet_content: 'three',
      },
    ]);

    const results = await recallPastChats('user-1', 'q', { limit: 2 });
    expect(results.length).toBe(2);
  });
});

describe('getThreadRecallContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the thread is not owned/visible', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const ctx = await getThreadRecallContext('t-1', 'user-1');
    expect(ctx).toBeNull();
  });

  it('prefers the compaction summary when present', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        title: 'Langer Chat',
        updated_at: '2026-04-01T10:00:00Z',
        compaction_summary: 'die Zusammenfassung',
      },
    ]);
    const ctx = await getThreadRecallContext('t-1', 'user-1');
    expect(ctx?.transcript).toBe('die Zusammenfassung');
    expect(mockQuery).toHaveBeenCalledTimes(1); // no message fetch needed
  });

  it('falls back to the last N messages in chronological order', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { title: 'Chat', updated_at: '2026-04-01T10:00:00Z', compaction_summary: null },
      ])
      .mockResolvedValueOnce([
        { role: 'assistant', content: 'zweite Antwort' },
        { role: 'user', content: 'erste Frage' },
      ]);
    const ctx = await getThreadRecallContext('t-1', 'user-1');
    // rows come DESC from SQL; service reverses to chronological
    expect(ctx?.transcript).toBe('[user] erste Frage\n[assistant] zweite Antwort');
  });

  it('caps transcript length at maxChars', async () => {
    mockQuery.mockResolvedValueOnce([
      { title: 'Chat', updated_at: '2026-04-01T10:00:00Z', compaction_summary: 'X'.repeat(9000) },
    ]);
    const ctx = await getThreadRecallContext('t-1', 'user-1', { maxChars: 100 });
    expect(ctx?.transcript.length).toBe(100);
  });
});

describe('formatPastChatsBlock', () => {
  it('renders the German header, titles and de-DE dates', () => {
    const block = formatPastChatsBlock([makeHit('t-1', 'Newsletter Planung')]);
    expect(block).toContain('## RELEVANTE VERGANGENE GESPRÄCHE');
    expect(block).toContain('NICHT ZITIEREN');
    expect(block).toContain('„Newsletter Planung"');
    expect(block).toContain('Gespräch vom 01.04.2026');
  });

  it('appends the deep-read section only when a transcript is supplied', () => {
    const without = formatPastChatsBlock([makeHit('t-1', 'A')]);
    expect(without).not.toContain('Vollständiger Verlauf');

    const withDeep = formatPastChatsBlock([makeHit('t-1', 'A')], {
      title: 'A',
      transcript: '[user] hallo',
    });
    expect(withDeep).toContain('Vollständiger Verlauf des relevantesten Gesprächs');
    expect(withDeep).toContain('[user] hallo');
  });
});

describe('recallOfficeDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps subtypes to labels, per-subtype URLs and snippets (incl. boards)', async () => {
    mockSearchOfficeContent.mockResolvedValue([
      {
        id: 'd1',
        title: 'Klimastrategie',
        document_subtype: 'presentations',
        updated_at: '2026-04-01T10:00:00Z',
        content: '<ol><li>Ziele</li><li>Maßnahmen</li></ol>',
      },
      {
        id: 'b1',
        title: 'Kampagnen-Board',
        document_subtype: 'boards',
        updated_at: '2026-03-20T10:00:00Z',
        content: JSON.stringify({
          board_type: 'kanban',
          preview: { columns: [{ name: 'To Do' }], notes: [] },
        }),
      },
    ]);
    const docs = await recallOfficeDocuments('user-1', 'Klima', 5);
    expect(docs[0]).toMatchObject({
      id: 'd1',
      kind: 'Präsentation',
      subtype: 'presentations',
      url: '/office/d1',
    });
    expect(docs[0].snippet).toContain('Ziele');
    expect(docs[1]).toMatchObject({
      id: 'b1',
      kind: 'Board',
      subtype: 'boards',
      url: '/boards/b1',
    });
    expect(docs[1].snippet).toContain('To Do');
  });

  it('returns [] for an empty query without hitting the DB', async () => {
    const docs = await recallOfficeDocuments('user-1', '   ', 5);
    expect(docs).toEqual([]);
    expect(mockSearchOfficeContent).not.toHaveBeenCalled();
  });

  it('degrades to [] when the office search throws', async () => {
    mockSearchOfficeContent.mockRejectedValue(new Error('DB down'));
    const docs = await recallOfficeDocuments('user-1', 'Klima', 5);
    expect(docs).toEqual([]);
  });
});

describe('formatOfficeDocsBlock', () => {
  it('returns empty string when there are no docs', () => {
    expect(formatOfficeDocsBlock([])).toBe('');
  });

  it('renders a header and one line per item with kind + date', () => {
    const block = formatOfficeDocsBlock([
      {
        id: 'd1',
        title: 'Klimastrategie',
        subtype: 'presentations',
        kind: 'Präsentation',
        snippet: '',
        url: '/office/d1',
        updatedAt: '2026-04-01T10:00:00Z',
      },
    ]);
    expect(block).toContain('## RELEVANTE EIGENE INHALTE');
    expect(block).toContain('„Klimastrategie" (Präsentation, 01.04.2026)');
  });
});

describe('rerankRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeOffice(id: string, title: string) {
    return {
      id,
      title,
      subtype: 'docs',
      kind: 'Dokument',
      snippet: `about ${title}`,
      url: `/office/${id}`,
      updatedAt: '2026-04-01T10:00:00Z',
    };
  }

  it('reorders across sources by rerank result and keeps top-N', async () => {
    // Rank office(index 2) first, then chat(index 0); drop the rest.
    mockRerankPipeline.mockResolvedValue({ rankedIndices: [2, 0], scores: new Map() });
    const chats = [makeHit('c1', 'One'), makeHit('c2', 'Two')];
    const office = [makeOffice('o1', 'Doc A')];
    const out = await rerankRecall('query', chats, office, 2);
    expect(out.officeDocs.map((d) => d.id)).toEqual(['o1']);
    expect(out.chats.map((c) => c.threadId)).toEqual(['c1']);
  });

  it('falls back to unranked order (truncated) when rerank throws', async () => {
    mockRerankPipeline.mockRejectedValue(new Error('rerank down'));
    const chats = [makeHit('c1', 'One'), makeHit('c2', 'Two')];
    const office = [makeOffice('o1', 'Doc A')];
    const out = await rerankRecall('query', chats, office, 2);
    expect(out.chats.map((c) => c.threadId)).toEqual(['c1', 'c2']);
    expect(out.officeDocs).toEqual([]);
  });

  it('skips rerank for a single candidate', async () => {
    const out = await rerankRecall('query', [makeHit('c1', 'One')], [], 3);
    expect(out.chats.map((c) => c.threadId)).toEqual(['c1']);
    expect(mockRerankPipeline).not.toHaveBeenCalled();
  });
});
