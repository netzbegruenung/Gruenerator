/**
 * A cloud file picked in one turn is still there in the next (#4112).
 *
 * The client sends `connectFiles`/`wolkeFiles` only for the turn the file was
 * picked in. Without the thread carrying the ref, a follow-up about the file
 * saw nothing but the model's own previous answer — while a local upload in the
 * same position stayed readable. Asserted on the state the follow-up turn
 * hands to the answer path — the loop is faked here, so the provider read
 * itself is out of reach.
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

const { useChatApp } = await import('./harness/suite.js');
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { threads } = await import('./harness/fakeThreadStore.js');
const { respond } = await import('./harness/respondScript.js');

const suite = useChatApp();

const FILE = { provider: 'google-drive', fileId: 'file-1', name: 'Haushalt.docx' };

const lastTurnFiles = () => respond.agenticCalls.at(-1)?.finalState.connectFiles;

describe('cloud files stay in the thread (#4112)', () => {
  it('hands a file picked one turn earlier to the follow-up', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fasse die Datei zusammen')],
      connectFiles: [FILE],
    });
    const threadId = first.trace.threadId;
    expect(lastTurnFiles()).toEqual([FILE]);

    const second = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Was steht darin zu Radwegen?', 'm2')],
      threadId,
    });

    expect(second.trace.intent).toBe('search');
    expect(lastTurnFiles()).toEqual([FILE]);
    // Refs only — what the thread row keeps is the pick, nothing more.
    expect(threads.get(threadId!)?.cloudFiles).toEqual({ wolke: [], connect: [FILE] });
  });

  it('does not hand the files to a different thread', async () => {
    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Fasse die Datei zusammen')],
      connectFiles: [FILE],
    });
    await runTurn(suite.baseUrl(), { messages: [userTurn('Was steht darin zu Radwegen?')] });

    expect(lastTurnFiles()).toEqual([]);
  });
});
