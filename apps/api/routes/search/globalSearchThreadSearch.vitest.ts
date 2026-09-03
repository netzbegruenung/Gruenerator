/**
 * `threadSearch` — the sidebar's thread search.
 *
 * Two of these guard things a shape test cannot see. `ownedOnly` is not a
 * formatting detail: `searchChatHistory` defaults it to false, and without it
 * every `is_public` thread in the system matches what the user reads as "my
 * chats" (the option's own doc comment says so). And the handler must let a DB
 * error surface as 500 — settling it to an empty list, the way the
 * multi-category `search` deliberately does for one dead backend among five,
 * would render here as "keine Treffer", which is a lie.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ChatSearchResult } from '../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

const searchChatHistory = vi.fn<() => Promise<ChatSearchResult[]>>();

vi.mock('../chat/services/chatSearchService.js', () => ({ searchChatHistory }));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {},
}));
vi.mock('../../services/canvas/canvasRepository.js', () => ({ searchCanvases: vi.fn() }));
vi.mock('../../services/sharedMediaService.js', () => ({ getSharedMediaService: vi.fn() }));
vi.mock('../docs/docsSearch.js', () => ({
  officeKind: vi.fn(),
  officeSnippet: vi.fn(),
  officeUrl: vi.fn(),
  searchDocuments: vi.fn(),
  searchOfficeContent: vi.fn(),
}));

const { globalSearchContractRouter } = await import('./globalSearchContractRouter.js');

const req = { user: { id: 'user-1' } } as unknown as Request;

function hit(over: Partial<ChatSearchResult> = {}): ChatSearchResult {
  return {
    threadId: 'thread-1',
    threadTitle: 'Klimaplan',
    threadSlugSuffix: 'ab12cd',
    agentId: 'default',
    snippet: '…Windkraft im Landkreis…',
    messageRole: 'assistant',
    matchedAt: '2026-09-01T10:00:00.000Z',
    threadUpdatedAt: '2026-09-01T10:05:00.000Z',
    ...over,
  };
}

async function call(q: string) {
  return globalSearchContractRouter.threadSearch({ req, query: { q } } as never);
}

describe('threadSearch', () => {
  it('restricts the search to the caller’s own threads', async () => {
    searchChatHistory.mockResolvedValue([]);

    await call('windkraft');

    expect(searchChatHistory).toHaveBeenCalledWith(
      'user-1',
      'windkraft',
      expect.objectContaining({ ownedOnly: true })
    );
  });

  it('asks for a list-sized result count, not the palette’s five', async () => {
    searchChatHistory.mockResolvedValue([]);

    await call('windkraft');

    expect(searchChatHistory).toHaveBeenCalledWith(
      'user-1',
      'windkraft',
      expect.objectContaining({ limit: 20 })
    );
  });

  it('names an untitled thread rather than shipping null', async () => {
    searchChatHistory.mockResolvedValue([hit({ threadTitle: null })]);

    const res = await call('windkraft');

    expect(res.status).toBe(200);
    expect((res.body as { items: { title: string }[] }).items[0]?.title).toBe('Unbenannter Chat');
  });

  it('carries the snippet and the matched timestamp through', async () => {
    searchChatHistory.mockResolvedValue([hit()]);

    const res = await call('windkraft');

    expect((res.body as { items: unknown[] }).items[0]).toEqual({
      threadId: 'thread-1',
      title: 'Klimaplan',
      snippet: '…Windkraft im Landkreis…',
      messageRole: 'assistant',
      matchedAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('answers 500 when the search throws instead of an empty list', async () => {
    searchChatHistory.mockRejectedValue(new Error('connection terminated'));

    const res = await call('windkraft');

    expect(res.status).toBe(500);
    expect(res.body).not.toEqual(expect.objectContaining({ items: [] }));
  });
});
