/**
 * @doc, saved-text and @link picks are still there in a follow-up turn that
 * sends no chip (#4861), and a reload gets their chips back.
 *
 * Same seam as notebookSourceCarry: asserted on the state the follow-up hands
 * to the answer path. Storage is faked down to the two tables the picks are
 * read from; the queries themselves (and their access filters) run as written.
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
    if (sql.includes('FROM user_documents WHERE user_id = $1 AND id = ANY($2)')) {
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
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { threads, messagesOf } = await import('./harness/fakeThreadStore.js');
const { respond } = await import('./harness/respondScript.js');

const suite = useChatApp();

const LINK = 'https://example.org/beschluss-radweg';
const lastState = () => respond.agenticCalls.at(-1)?.finalState;

describe('@doc, saved-text and @link picks stay in the thread', () => {
  it('reads saved texts and @doc content again in a follow-up that sends no chip', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fass mir das bitte zusammen.')],
      textIds: [IDS.text],
      docMentionIds: [IDS.doc],
    });
    const threadId = first.trace.threadId!;
    expect(threads.get(threadId)?.mentionRefs).toEqual({
      texts: [IDS.text],
      docs: [IDS.doc],
      links: [],
    });
    // The chips a reload restores.
    expect(messagesOf(threadId).find((m) => m.role === 'user')?.metadata).toEqual({
      mentionChips: [
        { kind: 'text', id: IDS.text, title: 'Pressemitteilung Radweg' },
        { kind: 'doc', id: IDS.doc, title: 'Antrag Schulhof' },
      ],
    });

    respond.agenticCalls.length = 0;
    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Und was kostet der Radweg?', 'm2')],
      threadId,
    });

    expect(respond.agenticCalls).toHaveLength(1);
    const state = respond.agenticCalls[0]!.finalState;
    // Carried, both are referenced material — not an attachment (which claims
    // the turn as `produktion`) and not an edit/share order.
    expect(state.documentMentionContext).toContain('98.000 Euro');
    expect(state.documentMentionContext).toContain('Schulhof wird entsiegelt');
    expect(state.attachmentContext ?? null).toBeNull();
    expect(state.docMentionIds ?? []).toEqual([]);
  });

  it('reads an @link page again in a follow-up that sends no chip', async () => {
    crawled.length = 0;
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fass mir das bitte zusammen.')],
      webpageUrls: [LINK],
    });
    const threadId = first.trace.threadId!;
    expect(messagesOf(threadId).find((m) => m.role === 'user')?.metadata).toEqual({
      mentionChips: [{ kind: 'link', id: LINK, title: 'example.org/beschluss-radweg' }],
    });

    // The pick turn reads the page on the scrape path.
    expect(crawled).toEqual([[LINK]]);

    // Small talk does not fetch the page again …
    crawled.length = 0;
    const thanks = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Danke dir!', 'm2')],
      threadId,
    });
    expect(thanks.trace.intent).not.toBe('scrape_url');
    expect(crawled).toEqual([]);

    // … a follow-up that reads the material does.
    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fass es nochmal in drei Sätzen zusammen.', 'm3')],
      threadId,
    });
    expect(crawled).toEqual([[LINK]]);
  });

  it('carries nothing this user cannot read, and gives it no chip', async () => {
    const foreign = 'f0000000-0000-4000-8000-0000000000f1';
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fass mir das bitte zusammen.')],
      textIds: [foreign],
      docMentionIds: [foreign],
    });
    const threadId = first.trace.threadId!;
    expect(messagesOf(threadId).find((m) => m.role === 'user')?.metadata).toBeUndefined();

    respond.agenticCalls.length = 0;
    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Und was steht darin?', 'm2')],
      threadId,
    });
    expect(respond.agenticCalls).toHaveLength(1);
    const state = respond.agenticCalls[0]!.finalState;
    expect(state.attachmentContext ?? '').not.toContain('98.000');
    expect(state.documentMentionContext ?? null).toBeNull();
  });
});
