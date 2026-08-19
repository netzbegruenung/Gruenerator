/**
 * Routing inputs, degrade insurance, and the context window handed to pruning.
 *
 * The decision TABLE is not re-tested here — `agenticLoop/routing.vitest.ts`
 * covers it with 48 cases. What only the router can be asked is whether it
 * assembles the right inputs, whether its degrade insurance still fires, and
 * whether the answer path receives the messages it should.
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
const { pinChatEnv } = await import('./harness/env.js');
const { respond } = await import('./harness/respondScript.js');

const suite = useChatApp();

/** A phrasing measured to demote into the agentic loop (heuristic search@0.82). */
const FACTUAL = 'Was ist die Position der Grünen zur Windkraft?';

describe('loop entry', () => {
  it('enters the loop and says so on the wire — both, never one', async () => {
    // The router reads the same `runAgentic` boolean twice: once to stamp
    // `intent.agentic` for the client, once to pick the branch. Asserting only
    // the flag would let a regression that sets it without taking the branch
    // pass; asserting only the call would miss the client being misinformed.
    const { trace } = await runTurn(suite.baseUrl(), { messages: [userTurn(FACTUAL)] });

    expect(trace.agentic).toBe(true);
    expect(respond.agenticCalls).toHaveLength(1);
    expect(respond.singlePassCalls).toHaveLength(0);
  });

  it('never claims agentic on a turn that took the single-pass branch', async () => {
    const { trace } = await runTurn(suite.baseUrl(), { messages: [userTurn('Hallo!')] });

    expect(trace.agentic).toBe(false);
    expect(respond.agenticCalls).toHaveLength(0);
    expect(respond.singlePassCalls).toHaveLength(1);
  });

  /**
   * The word "recherchiere" used to route AWAY from the loop, and the intent
   * that promises the most retrieval delivered the least: measured live, 3
   * sources in 31s against 10 in 15s for the same question phrased without it.
   * `research` sits in AGENTIC_INTENTS now, and this asserts it through the REAL
   * set — the `decideRunAgentic` unit tests inject their own fixture, so they
   * cannot see it drift back out.
   */
  it('routes a prose research ask into the loop, not onto the deterministic path', async () => {
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Recherchiere im Netz: wer war Marilyn Monroe')],
    });

    expect(trace.intent).toBe('research');
    expect(trace.agentic).toBe(true);
    expect(respond.agenticCalls).toHaveLength(1);
    expect(respond.singlePassCalls).toHaveLength(0);
  });

  /**
   * The other half, and the reason the change is safe: `@deepresearch` is the
   * ONLY token authorising Linkup's `sourcedAnswer` dossier, and that dossier is
   * written on the single-pass path. It sets `forcedTool`, which the gate keeps
   * out of the loop — so widening the intent set must not reach it.
   */
  it('leaves a forced @deepresearch turn on the single-pass dossier path', async () => {
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('@[Deep Research](tool:deepresearch) wer war Marilyn Monroe')],
    });

    expect(trace.intent).toBe('research');
    expect(trace.agentic).toBe(false);
    expect(respond.agenticCalls).toHaveLength(0);
    expect(respond.singlePassCalls).toHaveLength(1);
  });
});

// GELÖSCHT: „degrade insurance".
//
// Der Fall setzte `CHAT_AGENT_LOOP=false` und erwartete, dass der Router einen
// `agentic`-Intent auf einen laufbaren umbiegt. Mit ausgeschaltetem Schalter
// demotiert Tier 3.5 gar nicht mehr, und die zweite Quelle für `agentic` — der
// Auffangwert der LLM-Stufe — ist gelöscht. Innerhalb eines Requests kann der
// Intent also nicht mehr entstehen; erreichbar bleibt der Guard nur über eine
// wiederaufgenommene Konversation, die dieser Aufbau nicht herstellt. Der Guard
// steht weiter im Router und benennt seine fehlende Abdeckung dort.

describe('context window', () => {
  it('prunes against the resolved model window, not the pre-classifier default', async () => {
    // Documented in the router in prose: this MUST be resolved before pruning,
    // not just before compaction — `pruneMessages` physically drops the oldest
    // turns, so running it on the stale 32k default trimmed a 128k lane to
    // ~20k tokens. Only reachable through the router.
    // Large enough that an 8k window must actually drop turns — a history that
    // fits in both windows would make this test pass without pruning ever
    // running.
    const history = Array.from({ length: 24 }, (_, i) =>
      userTurn(
        `Frage ${i}: ${'Windkraft Ausbau in den Kommunen beschleunigen. '.repeat(300)}`,
        `m${i}`
      )
    );

    respond.resolution = { contextWindow: 128_000 };
    const wide = await runTurn(suite.baseUrl(), {
      messages: [...history, userTurn('Und nun?', 'mz')],
    });
    expect(wide.trace.error).toBeNull();
    const wideMessages = respond.singlePassCalls.at(-1)?.messages as unknown[] | undefined;

    respond.reset();
    respond.resolution = { contextWindow: 8_000 };
    const narrow = await runTurn(suite.baseUrl(), {
      messages: [...history, userTurn('Und nun?', 'mz')],
    });
    expect(narrow.trace.error).toBeNull();
    const narrowMessages = respond.singlePassCalls.at(-1)?.messages as unknown[] | undefined;

    expect(wideMessages, 'single-pass path must have been taken').toBeDefined();
    expect(narrowMessages).toBeDefined();
    // The window has to actually reach pruning: a wide lane must keep strictly
    // more history than a narrow one for the same input.
    expect((wideMessages ?? []).length).toBeGreaterThan((narrowMessages ?? []).length);
  });
});

describe('editor surfaces', () => {
  /** Minimal live-board projection, the shape the boards sidebar serializes. */
  const openBoard = {
    id: 'b1e7c1a4-0000-4000-8000-000000000001',
    title: 'Kampagne',
    boardType: 'kanban' as const,
    fields: [
      { id: 'title', name: 'Titel', type: 'text' as const, typeOptions: {}, order: 0 },
      { id: 'status', name: 'Status', type: 'singleSelect' as const, typeOptions: {}, order: 1 },
    ],
    rows: [],
    views: [
      {
        id: 'v1',
        name: 'Kanban',
        layout: 'kanban' as const,
        groupByFieldId: 'status',
        filters: [],
        sorts: [],
        fieldSettings: [],
      },
    ],
    groupByFieldId: 'status',
    statusOptions: [{ id: 'todo', name: 'To-Do', color: 'blue' }],
    assignableMembers: [],
  };

  /**
   * The board sidebar's `currentBoard` has to reach the GRAPH STATE, not just
   * the raw body. It was read off `args.body` for the legacy trigger path and
   * never handed to `initializeChatState`, so `state.currentBoard` stayed null:
   * this fast-path never fired, and the loop's `edit_document` tool aborted
   * with "Es ist kein Board geöffnet" on every board edit.
   *
   * Asserted through the intent rather than the tool because only the
   * classifier reads `state.currentBoard` this early — a state that carries the
   * board cannot produce any other intent for this phrasing.
   */
  it('carries the open board into the classifier state', async () => {
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle eine Aufgabe „Plakate bestellen" in To-Do')],
      agentId: 'gruenerator-boards-editor',
      enabledTools: { edit_current_board: true },
      currentBoard: openBoard,
    });

    expect(trace.intent).toBe('edit_current_board');
  });

  it('keeps the same phrasing off the board path when no board is open', async () => {
    const { trace } = await runTurn(suite.baseUrl(), {
      messages: [userTurn('Erstelle eine Aufgabe „Plakate bestellen" in To-Do')],
      agentId: 'gruenerator-boards-editor',
      enabledTools: { edit_current_board: true },
    });

    expect(trace.intent).not.toBe('edit_current_board');
  });
});
