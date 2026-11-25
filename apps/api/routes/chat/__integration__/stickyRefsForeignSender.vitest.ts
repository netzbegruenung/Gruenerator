/**
 * Team chats: refs pinned on a thread (cloud files, @doc / saved-text picks)
 * were written by one person with that person's access. Another member's turn
 * in the same thread must not carry them, and must not overwrite them.
 *
 * The sticky MCP scope is covered in catalogAssembly.vitest.ts (its owner
 * check sits in the catalog assembly, below this seam).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});

const IDS = vi.hoisted(() => ({
  user: '00000000-0000-4000-a000-000000000042',
  text: 'c0000000-0000-4000-8000-0000000000c1',
  doc: 'e0000000-0000-4000-8000-0000000000e1',
}));

// Only the queries the mention paths ask; anything else still fails by name.
vi.mock('../../../database/services/PostgresService.js', async () => {
  const text = {
    id: IDS.text,
    title: 'Pressemitteilung Radweg',
    content: 'Der Radweg kostet 98.000 Euro.',
  };
  const doc = { id: IDS.doc, title: 'Antrag Schulhof', content: 'Der Schulhof wird entsiegelt.' };
  const query = (sql: string, params: unknown[]) => {
    if (sql.includes('FROM user_documents WHERE') && sql.includes('AND id = ANY($2)')) {
      const [userId, ids] = params as [string, string[]];
      return Promise.resolve(userId === IDS.user && ids.includes(text.id) ? [text] : []);
    }
    if (sql.includes('FROM collaborative_documents')) {
      const [ids, userId] = params as [string[], string];
      return Promise.resolve(userId === IDS.user && ids.includes(doc.id) ? [doc] : []);
    }
    throw new Error(`unexpected Postgres query: ${String(sql).slice(0, 300)}`);
  };
  return { getPostgresInstance: () => ({ query }) };
});
const crawled = vi.hoisted(() => [] as string[][]);
vi.mock('../../../services/search/CrawlingService.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  crawlAndDistill: (seeds: Array<{ url: string }>) => {
    crawled.push(seeds.map((s) => s.url));
    return Promise.resolve(
      seeds.map((s) => ({ ...s, crawled: true, content: 'Der Radweg wird 2027 gebaut.' }))
    );
  },
}));
// No Yjs state: the doc-mention path falls back to the stored content.
vi.mock('../../../services/docs/docContentService.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getDocumentHtml: () => Promise.resolve(null),
}));

vi.mock('../services/threadPersistenceService.js', async () => {
  return await import('./harness/fakeThreadStore.js');
});
vi.mock('../services/threadAccessService.js', async () => {
  const { threadAccessMock } = await import('./harness/mocks.js');
  return threadAccessMock();
});
vi.mock('../services/compactionService.js', async (orig) => {
  const { compactionMock } = await import('./harness/mocks.js');
  return compactionMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/attachmentPersistenceService.js', async (orig) => {
  const { attachmentPersistenceMock } = await import('./harness/mocks.js');
  return attachmentPersistenceMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pastChatRecallService.js', async (orig) => {
  const { pastChatRecallMock } = await import('./harness/mocks.js');
  return pastChatRecallMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/postResponseService.js', async (orig) => {
  const { postResponseMock } = await import('./harness/mocks.js');
  return postResponseMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pipelineStateStore.js', async () => {
  const { pipelineStateStoreMock } = await import('./harness/mocks.js');
  return pipelineStateStoreMock();
});
vi.mock('../services/sharepicEditService.js', async (orig) => {
  const { sharepicEditMock } = await import('./harness/mocks.js');
  return sharepicEditMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/agenticLoop/agenticRespondService.js', async (orig) => {
  const { fakeStreamAgenticResponse } = await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamAgenticResponse: fakeStreamAgenticResponse,
  };
});
vi.mock('../services/responseStreamingService.js', async (orig) => {
  const { fakeResolveModel, fakeStreamForResolution, fakeStreamWithFallback } =
    await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    resolveModel: fakeResolveModel,
    streamForResolution: fakeStreamForResolution,
    streamWithFallback: fakeStreamWithFallback,
  };
});

const { useChatApp } = await import('./harness/suite.js');
const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { threads } = await import('./harness/fakeThreadStore.js');
const { respond } = await import('./harness/respondScript.js');

const suite = useChatApp({ user: { id: IDS.user } });

const FILE = { provider: 'google-drive', fileId: 'file-1', name: 'Haushalt.docx' };
const MEMBER = '00000000-0000-4000-a000-0000000000bb';

describe('thread-pinned refs resolve with the sender’s own access', () => {
  it('does not carry the writer’s refs into another member’s turn, and leaves them intact', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fass mir das bitte zusammen.')],
      connectFiles: [FILE],
      textIds: [IDS.text],
      docMentionIds: [IDS.doc],
    });
    const threadId = first.trace.threadId!;
    const stored = structuredClone({
      cloud: threads.get(threadId)?.cloudFiles,
      mentions: threads.get(threadId)?.mentionRefs,
    });
    expect(stored.cloud?.connect).toEqual([FILE]);
    expect(stored.mentions?.texts).toEqual([IDS.text]);

    const member = await startChatApp({ user: { id: MEMBER } });
    try {
      respond.agenticCalls.length = 0;
      const turn = await runTurn(member.baseUrl, {
        messages: [userTurn('Und was kostet der Radweg?', 'm2')],
        threadId,
      });
      expect(turn.trace.error).toBeNull();
      expect(respond.agenticCalls).toHaveLength(1);
      const state = respond.agenticCalls[0]!.finalState;
      expect(state.connectFiles ?? []).toEqual([]);
      expect(state.documentMentionContext ?? null).toBeNull();
      expect(JSON.stringify(state.attachmentContext ?? '')).not.toContain('98.000');
    } finally {
      await member.close();
    }

    // The member's turn wrote nothing over the writer's refs.
    expect(threads.get(threadId)?.cloudFiles).toEqual(stored.cloud);
    expect(threads.get(threadId)?.mentionRefs).toEqual(stored.mentions);
  });

  it('still carries them on the writer’s own next turn', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fass mir das bitte zusammen.')],
      connectFiles: [FILE],
      textIds: [IDS.text],
    });
    const threadId = first.trace.threadId!;

    respond.agenticCalls.length = 0;
    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Und was kostet der Radweg?', 'm2')],
      threadId,
    });
    const state = respond.agenticCalls[0]!.finalState;
    expect(state.connectFiles).toEqual([FILE]);
    expect(state.documentMentionContext).toContain('98.000 Euro');
  });
});
