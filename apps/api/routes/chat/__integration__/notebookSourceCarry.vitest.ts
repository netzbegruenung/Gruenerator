/**
 * A notebook document handed over from the reader („Im Chat besprechen") is
 * still there in the follow-up turn, which sends no chip — and it is checked
 * again there, never trusted from the thread row.
 *
 * Same seam as cloudFileCarry: asserted on the state the follow-up hands to the
 * answer path. The Qdrant side of the check is the harness stub, which knows
 * exactly one system document.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});

vi.mock('../../../database/services/PostgresService.js', async () => {
  const { postgresMock } = await import('./harness/mocks.js');
  return postgresMock();
});
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

vi.mock('../agents/notebookSourceTools.js', async (orig) => {
  const { fakeScrollPage } = await import('./harness/searchBackendStub.js');
  return { ...((await orig()) as Record<string, unknown>), qdrantScrollPage: fakeScrollPage };
});
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => {
  const { fakeQdrantDocumentService } = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    getQdrantDocumentService: fakeQdrantDocumentService,
  };
});

const { useChatApp } = await import('./harness/suite.js');
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { threads } = await import('./harness/fakeThreadStore.js');
const { respond } = await import('./harness/respondScript.js');
const { SYSTEM_DOC } = await import('./harness/searchBackendStub.js');

const suite = useChatApp();

const REF = { collectionId: SYSTEM_DOC.collectionId, sourceUrl: SYSTEM_DOC.sourceUrl };

const lastTurnSources = () => respond.agenticCalls.at(-1)?.finalState.notebookSources;

describe('notebook documents from the reader stay in the thread', () => {
  it('hands the document to a follow-up that sends no chip', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Worum geht es in diesem Dokument?')],
      notebookSourceRefs: [REF],
    });
    const threadId = first.trace.threadId;
    expect(lastTurnSources()).toEqual([
      expect.objectContaining({ kind: 'system', sourceUrl: SYSTEM_DOC.sourceUrl }),
    ]);

    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Was steht darin zum Radverkehr?', 'm2')],
      threadId,
    });

    expect(lastTurnSources()).toEqual([
      expect.objectContaining({ kind: 'system', title: SYSTEM_DOC.title }),
    ]);
    expect(threads.get(threadId!)?.notebookSources).toEqual([REF]);
  });

  it('drops a ref the reader rule does not grant and keeps it out of the thread', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Worum geht es in diesem Dokument?')],
      notebookSourceRefs: [
        { collectionId: SYSTEM_DOC.collectionId, sourceUrl: 'https://x.de/fremd' },
      ],
    });

    expect(first.trace.warnings).toContain('notebook_sources_dropped');
    expect(lastTurnSources()).toEqual([]);
    expect(threads.get(first.trace.threadId!)?.notebookSources ?? null).toBeNull();
  });
});
