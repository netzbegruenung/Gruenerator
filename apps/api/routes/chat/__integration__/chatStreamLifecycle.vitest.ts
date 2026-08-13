/**
 * Terminal events, error codes, thread minting, and the pinned environment.
 *
 * These tests own the sequencing between `buildStreamContext` and `sse.end()`.
 * They do NOT own model behaviour (loopEngine.vitest.ts), the routing decision
 * table (agenticLoop/routing.vitest.ts), the guard predicates
 * (fastPathGuards.vitest.ts), persistence SQL, or auth
 * (middleware/authMiddleware.vitest.ts).
 */
import { describe, expect, it, vi } from 'vitest';

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
const { userTurn, startChatApp, postStream } = await import('./harness/testApp.js');
const { runTurn, assertEventOrder } = await import('./harness/trace.js');
const { envGuardValues } = await import('./harness/env.js');
const { threadAccess, persistControl } = await import('./harness/mocks.js');
const { threads } = await import('./harness/fakeThreadStore.js');
const { createAiWorkerPoolStub } = await import('./harness/aiWorkerPoolStub.js');

const suite = useChatApp();

function greeting(): Record<string, unknown> {
  return { messages: [userTurn('Hallo!')] };
}

describe('stream lifecycle', () => {
  it('ends every turn with exactly one terminal event, in order', async () => {
    const { events, trace } = await runTurn(suite.baseUrl(), greeting());

    assertEventOrder(events);
    expect(events.filter((e) => e.event === 'done')).toHaveLength(1);
    expect(events.filter((e) => e.event === 'error')).toHaveLength(0);
    expect(trace.threadId).toBeTruthy();
  });

  it('mints exactly one thread per new conversation', async () => {
    const { events } = await runTurn(suite.baseUrl(), greeting());

    expect(events.filter((e) => e.event === 'thread_created')).toHaveLength(1);
    expect(threads.size).toBe(1);
  });

  it('reuses the thread when the client sends its id back', async () => {
    const first = await runTurn(suite.baseUrl(), greeting());
    const threadId = first.trace.threadId;
    expect(threadId).toBeTruthy();

    const second = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Und weiter?', 'm2')],
      threadId,
    });

    expect(second.trace.threadId ?? threadId).toBe(threadId);
    expect(threads.size).toBe(1);
  });

  it('überlebt ein replaceFromMessageId, das keine uuid ist', async () => {
    // 13.08.2026: der Client schickte „Xa4ZTed" — einen Slug-Suffix, keine
    // Zeilen-id. `deleteMessagesFrom` reichte ihn ungeprüft an SQL weiter,
    // Postgres warf 22P02, und die Ausnahme nahm den ganzen Turn mit: „Es ist
    // ein interner Fehler aufgetreten", bevor ein einziges Token geschrieben
    // war. Der threadId eine Zeile höher war seit Langem geprüft.
    const first = await runTurn(suite.baseUrl(), greeting());
    const threadId = first.trace.threadId;

    const second = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Nochmal, anders formuliert', 'm2')],
      threadId,
      replaceFromMessageId: 'Xa4ZTed',
    });

    expect(second.trace.error).toBeNull();
    expect(second.events.filter((e) => e.event === 'done')).toHaveLength(1);
  });

  it('mints a fresh thread when the id is not accessible', async () => {
    const first = await runTurn(suite.baseUrl(), greeting());
    threadAccess.allow = false;

    const second = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Weiter', 'm2')],
      threadId: first.trace.threadId,
    });

    // A reap/race must not silently write into someone else's thread.
    expect(second.trace.threadId).toBeTruthy();
    expect(second.trace.threadId).not.toBe(first.trace.threadId);
  });

  it('drops a non-UUID threadId instead of passing it to Postgres', async () => {
    // `WHERE id = $1::uuid` on 'not-a-uuid' is a 22P02 at runtime, which would
    // surface as a 500 rather than a normal turn.
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Hallo!')],
      threadId: 'not-a-uuid',
    });

    expect(trace.error).toBeNull();
    expect(trace.threadId).toBeTruthy();
    expect(trace.threadId).not.toBe('not-a-uuid');
  });

  it('warns instead of failing when persistence reports not-ok', async () => {
    persistControl.ok = false;

    const { trace, events } = await runTurn(suite.baseUrl(), greeting());

    expect(trace.warnings).toContain('persist_failed');
    // Deliberately AFTER `done` but before `sse.end()`: the router awaits the
    // persist promise once the answer is out, and the client keeps reading
    // until the stream closes. The regression this pins is the older ordering,
    // where the await sat after `sse.end()` and a failed persist could not be
    // reported at all — the turn looked perfect live and was gone on reload.
    const warnIdx = events.findIndex(
      (e) => e.event === 'warning' && e.data.code === 'persist_failed'
    );
    expect(warnIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBe(events.length - 1);
  });
});

describe('stream error codes', () => {
  it('reports unauthorized as an SSE event, not an HTTP status', async () => {
    // HTTP 401 belongs to requireAuth, which this harness does not mount. What
    // the ROUTER does is emit a coded error on an otherwise normal stream —
    // that is what the frontend parses.
    const app = await startChatApp({ user: null, aiWorkerPool: createAiWorkerPoolStub() });
    try {
      const res = await postStream(app.baseUrl, greeting());
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(body).toContain('"code":"unauthorized"');
    } finally {
      await app.close();
    }
  });

  it('reports provider_unavailable when no worker pool is bound', async () => {
    const app = await startChatApp({ aiWorkerPool: null });
    try {
      const res = await postStream(app.baseUrl, greeting());
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(body).toContain('"code":"provider_unavailable"');
      expect(body).toContain('"retryable":true');
    } finally {
      await app.close();
    }
  });

  it('rejects a schema-invalid body at the contract layer', async () => {
    const res = await postStream(suite.baseUrl(), { messages: [] });
    const body = await res.text();

    // Recorded, not asserted from a guess: the ts-rest validation error handler
    // ends in Express's finalhandler, so this is HTML rather than a JSON 400 —
    // the same behaviour exportsContract.vitest.ts documents for the identical
    // wiring. Worth changing one day; pinned here so the change is deliberate.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get('content-type')).not.toContain('text/event-stream');
    expect(body).not.toContain('event: done');
  });
});

describe('environment pinning', () => {
  it('pins every routing-relevant env var', () => {
    // A missing pin does not fail on its own — it silently makes the suite
    // depend on the developer's .env (vitest.config.ts calls dotenvConfig, and
    // several of these are read at call time). This test is the alarm.
    for (const [key, value] of Object.entries(envGuardValues())) {
      expect(process.env[key] ?? '', `env ${key} must be pinned`).toBe(value);
    }
  });
});
