/**
 * One running turn per thread: a second send into a thread whose first turn is
 * still answering is refused with `thread_busy` before any row is written, and
 * the lock is released on every way a turn can end.
 */
import { describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => {
  let open: Promise<void> = Promise.resolve();
  let release: () => void = () => {};
  let failNext = false;
  return {
    close(): void {
      open = new Promise<void>((r) => {
        release = r;
      });
    },
    release: (): void => release(),
    failNext: (): void => {
      failNext = true;
    },
    async wait(): Promise<void> {
      await open;
      if (failNext) {
        failNext = false;
        throw new Error('model exploded');
      }
    },
  };
});

const redisFake = vi.hoisted(() => {
  const held = new Map<string, string>();
  return {
    held,
    client: {
      isReady: true,
      set: (key: string, value: string) => {
        if (held.has(key)) return Promise.resolve(null);
        held.set(key, value);
        return Promise.resolve('OK');
      },
      eval: (_s: string, o: { keys: string[]; arguments: string[] }) => {
        if (held.get(o.keys[0]) === o.arguments[0]) held.delete(o.keys[0]);
        return Promise.resolve(1);
      },
    },
  };
});
vi.mock('../../../utils/redis/client.js', () => ({ default: redisFake.client }));

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
    streamAgenticResponse: async (p: never) => {
      await gate.wait();
      return fakeStreamAgenticResponse(p);
    },
  };
});
vi.mock('../services/responseStreamingService.js', async (orig) => {
  const { fakeResolveModel, fakeStreamForResolution, fakeStreamWithFallback } =
    await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    resolveModel: fakeResolveModel,
    streamForResolution: async (p: never) => {
      await gate.wait();
      return fakeStreamForResolution(p);
    },
    streamWithFallback: fakeStreamWithFallback,
  };
});

const { useChatApp } = await import('./harness/suite.js');
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { messages } = await import('./harness/fakeThreadStore.js');

const suite = useChatApp();

async function seedThread(): Promise<string> {
  const first = await runTurn(suite.baseUrl(), { messages: [userTurn('Hallo!')] });
  const threadId = first.trace.threadId;
  if (!threadId) throw new Error('seed turn created no thread');
  return threadId;
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('thread run lock', () => {
  it('refuses a resume while a turn runs in the thread', async () => {
    const threadId = await seedThread();
    redisFake.held.set(`chat:thread-run:${threadId}`, 'someone-else');

    const res = await runTurn(
      suite.baseUrl(),
      { threadId, resume: 'Meine Antwort' },
      { resume: true, expectError: true }
    );
    const err = res.events.find((e) => e.event === 'error');
    expect(err?.data).toMatchObject({ code: 'thread_busy', retryable: true });
    redisFake.held.clear();
  });

  it('refuses a second turn while the first runs, then admits a third', async () => {
    const threadId = await seedThread();
    const rowsBefore = messages.size;

    gate.close();
    const first = runTurn(suite.baseUrl(), { threadId, messages: [userTurn('Eins', 'm2')] });
    await settle();
    const rowsWhileRunning = messages.size;

    const second = await runTurn(
      suite.baseUrl(),
      { threadId, messages: [userTurn('Zwei', 'm3')] },
      { expectError: true }
    );
    const err = second.events.find((e) => e.event === 'error');
    expect(err?.data).toMatchObject({ code: 'thread_busy', retryable: true });
    expect(messages.size).toBe(rowsWhileRunning);
    expect(rowsWhileRunning).toBeGreaterThan(rowsBefore);

    gate.release();
    await first;

    const third = await runTurn(suite.baseUrl(), { threadId, messages: [userTurn('Drei', 'm4')] });
    expect(third.trace.error).toBeNull();
  });

  it('releases the lock when the turn throws', async () => {
    const threadId = await seedThread();
    gate.close();
    gate.failNext();
    gate.release();
    await runTurn(
      suite.baseUrl(),
      { threadId, messages: [userTurn('Boom', 'm2')] },
      { expectError: true }
    );

    const next = await runTurn(suite.baseUrl(), { threadId, messages: [userTurn('Danach', 'm3')] });
    expect(next.trace.error).toBeNull();
    expect([...redisFake.held.keys()].filter((k) => k.startsWith('chat:thread-run:'))).toEqual([]);
  });
});
