/**
 * The palette's `chats` category — the one search over chat threads left after
 * the sidebar's own search field was removed.
 *
 * Three of these guard things a shape test cannot see. `ownedOnly` is not a
 * formatting detail: `searchChatHistory` defaults it to false, and without it
 * every `is_public` thread in the system matches what the user reads as "my
 * chats" (the option's own doc comment says so). `includeArchived` is what the
 * sidebar search used to contribute: without it a chat the user archived is
 * unfindable, which makes archiving look like deleting. And a failing category
 * must settle into `failedCategories` rather than 500 the whole palette — the
 * deliberate opposite of what the removed endpoint did, because four other
 * categories still have answers.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ChatSearchResult } from '../../agents/langgraph/ChatGraph/types.js';
import type { Request } from 'express';

const searchChatHistory = vi.fn<() => Promise<ChatSearchResult[]>>();

vi.mock('../chat/services/chatSearchService.js', () => ({ searchChatHistory }));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    searchUserNotebookCollections = vi.fn(async () => []);
  },
}));
vi.mock('../../services/canvas/canvasRepository.js', () => ({
  searchCanvases: vi.fn(async () => []),
}));
vi.mock('../../services/sharedMediaService.js', () => ({
  getSharedMediaService: () => ({ getMediaLibrary: vi.fn(async () => ({ items: [] })) }),
}));
vi.mock('../docs/docsSearch.js', () => ({
  officeKind: vi.fn(),
  officeSnippet: vi.fn(),
  officeUrl: vi.fn(),
  searchDocuments: vi.fn(async () => []),
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
    threadStatus: 'regular',
    ...over,
  };
}

type PaletteBody = {
  results: { chats: { title: string; url: string; archived?: boolean }[] };
  failedCategories: string[];
};

async function call(q: string) {
  const res = await globalSearchContractRouter.search({ req, query: { q } } as never);
  return { status: res.status, body: res.body as PaletteBody };
}

describe('global search — chats category', () => {
  it('restricts the search to the caller’s own threads', async () => {
    searchChatHistory.mockResolvedValue([]);

    await call('windkraft');

    expect(searchChatHistory).toHaveBeenCalledWith(
      'user-1',
      'windkraft',
      expect.objectContaining({ ownedOnly: true })
    );
  });

  it('asks for archived threads, so an archived chat stays findable', async () => {
    searchChatHistory.mockResolvedValue([]);

    await call('windkraft');

    expect(searchChatHistory).toHaveBeenCalledWith(
      'user-1',
      'windkraft',
      expect.objectContaining({ includeArchived: true })
    );
  });

  it('marks an archived hit so the row can say so', async () => {
    searchChatHistory.mockResolvedValue([hit({ threadStatus: 'archived' })]);

    const { body } = await call('windkraft');

    expect(body.results.chats[0]?.archived).toBe(true);
  });

  it('leaves a regular hit unmarked', async () => {
    searchChatHistory.mockResolvedValue([hit()]);

    const { body } = await call('windkraft');

    expect(body.results.chats[0]?.archived).toBe(false);
  });

  it('names an untitled thread rather than shipping null', async () => {
    searchChatHistory.mockResolvedValue([hit({ threadTitle: null })]);

    const { status, body } = await call('windkraft');

    expect(status).toBe(200);
    expect(body.results.chats[0]?.title).toBe('Unbenannter Chat');
  });

  it('reports a failing chat search as a failed category, not as a dead palette', async () => {
    searchChatHistory.mockRejectedValue(new Error('connection terminated'));

    const { status, body } = await call('windkraft');

    expect(status).toBe(200);
    expect(body.failedCategories).toContain('chats');
  });
});
