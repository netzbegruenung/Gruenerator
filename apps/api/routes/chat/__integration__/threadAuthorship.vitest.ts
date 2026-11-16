/**
 * Team chats: edit-resubmit and regenerate replace only the sender's OWN user
 * message. A turn on a foreign message is refused with `not_your_message`
 * before any row is touched.
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
const { messages, messagesOf } = await import('./harness/fakeThreadStore.js');

const suite = useChatApp();

const OTHER_USER = '00000000-0000-4000-a000-0000000000aa';

async function seedThread(): Promise<string> {
  const first = await runTurn(suite.baseUrl(), { messages: [userTurn('Hallo!')] });
  const threadId = first.trace.threadId;
  if (!threadId) throw new Error('seed turn created no thread');
  return threadId;
}

function lastUserRow(threadId: string) {
  const row = [...messagesOf(threadId)].reverse().find((m) => m.role === 'user');
  if (!row) throw new Error('no user row');
  return row;
}

describe('own messages only', () => {
  it('refuses regenerate on another member’s message and writes no rows', async () => {
    const threadId = await seedThread();
    lastUserRow(threadId).userId = OTHER_USER;
    const before = [...messages.keys()].sort();

    const res = await runTurn(
      suite.baseUrl(),
      { threadId, messages: [userTurn('Hallo!', 'm1')], regenerate: true },
      { expectError: true }
    );
    const err = res.events.find((e) => e.event === 'error');
    expect(err?.data).toMatchObject({ code: 'not_your_message', retryable: false });
    expect([...messages.keys()].sort()).toEqual(before);
  });

  it('refuses edit-resubmit on another member’s message', async () => {
    const threadId = await seedThread();
    const row = lastUserRow(threadId);
    row.userId = OTHER_USER;
    const before = [...messages.keys()].sort();

    const res = await runTurn(
      suite.baseUrl(),
      { threadId, messages: [userTurn('Anders', 'm2')], replaceFromMessageId: row.id },
      { expectError: true }
    );
    const err = res.events.find((e) => e.event === 'error');
    expect(err?.data).toMatchObject({ code: 'not_your_message', retryable: false });
    expect([...messages.keys()].sort()).toEqual(before);
  });

  it('lets the author regenerate their own message', async () => {
    const threadId = await seedThread();
    const res = await runTurn(suite.baseUrl(), {
      threadId,
      messages: [userTurn('Hallo!', 'm1')],
      regenerate: true,
    });
    expect(res.trace.error).toBeNull();
  });
});
