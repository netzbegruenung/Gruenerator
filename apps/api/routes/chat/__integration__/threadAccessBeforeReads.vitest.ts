/**
 * A thread id from the request body names a thread the user may not own.
 * Nothing keyed on it may be read before `canWriteThread` has said yes — not
 * the history backfill, not the attachments, not the tool history. The
 * legitimate backfill (an owned thread, an earlier message replayed empty)
 * keeps working.
 */
import { describe, expect, it, vi } from 'vitest';

const attachmentReads = vi.hoisted((): string[] => []);

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
  return {
    ...attachmentPersistenceMock((await orig()) as Record<string, unknown>),
    getThreadAttachments: (threadId: string) => {
      attachmentReads.push(threadId);
      return Promise.resolve([]);
    },
  };
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
const { threadReads } = await import('./harness/fakeThreadStore.js');
const { threadAccess } = await import('./harness/mocks.js');

const suite = useChatApp();

const FIRST_QUESTION = 'Wie hoch ist der Radverkehrsetat 2027?';

/** An earlier user message the client replays without its text. */
const emptyUserTurn = (id: string): Record<string, unknown> => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text: '' }],
});
const assistantTurn = (text: string, id: string): Record<string, unknown> => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});

/** A thread holding one earlier user message, as turn one leaves it. */
async function seedThread(): Promise<string> {
  const first = await runTurn(suite.baseUrl(), { messages: [userTurn(FIRST_QUESTION)] });
  const threadId = first.trace.threadId;
  if (!threadId) throw new Error('seed turn created no thread');
  threadReads.length = 0;
  attachmentReads.length = 0;
  return threadId;
}

const readsOf = (threadId: string): string[] =>
  [
    ...threadReads.filter((r) => r.threadId === threadId).map((r) => r.read),
    ...attachmentReads.filter((id) => id === threadId).map(() => 'getThreadAttachments'),
  ].sort();

describe('thread access is checked before any thread read', () => {
  it('backfills an empty earlier message from an owned thread', async () => {
    const threadId = await seedThread();

    await runTurn(suite.baseUrl(), {
      threadId,
      messages: [emptyUserTurn('m1'), assistantTurn('Antwort', 'm2'), userTurn('Und 2028?', 'm3')],
    });

    expect(readsOf(threadId)).toContain('getUserMessageTexts');
  });

  it('reads nothing from a thread the user may not write to', async () => {
    const foreignId = await seedThread();
    threadAccess.allow = false;

    const turn = await runTurn(suite.baseUrl(), {
      threadId: foreignId,
      messages: [emptyUserTurn('m1'), assistantTurn('Antwort', 'm2'), userTurn('Und 2028?', 'm3')],
    });

    expect(readsOf(foreignId)).toEqual([]);
    // The turn recovered onto a fresh thread of its own.
    expect(turn.trace.threadId).not.toBe(foreignId);
  });

  it('reads nothing from an unwritable thread on a turn without a user message', async () => {
    const foreignId = await seedThread();
    threadAccess.allow = false;

    await runTurn(
      suite.baseUrl(),
      { threadId: foreignId, messages: [assistantTurn('Antwort', 'm2')] },
      { expectError: true }
    );

    expect(readsOf(foreignId)).toEqual([]);
  });
});
