/**
 * Simulated runs through the REAL agentic loop, with committed decision maps.
 *
 * `simulatedRun.vitest.ts` doubles `streamAgenticResponse`, so the loop never
 * executes and both loop decision points render as `(not reached)` in every map
 * it writes. This file removes that double and replaces `ai`'s `streamText`
 * instead — `loopEngine` builds its `defaultDeps` from that import at module
 * scope, so the seam already existed and needs no production change.
 *
 * What becomes visible: the loop's three SILENT answer substitutions. The wire
 * carries only the substitute, so a wrongly swapped answer and a correct decline
 * are indistinguishable from outside — which is exactly why the over-refusal in
 * `evals/README.md` stayed a suspicion for so long.
 *
 * Regenerate the maps with SIM_UPDATE=1. A MISSING map is a failure, never a
 * silent create.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
// Only the retrieval BACKEND — the tool definitions, `wrapTools` and every guard
// stay real. Without this each search errors out, `noteFailure` fires, and the
// failure caps (2 per tool, 5 overall) trip before the search budget (6 calls)
// ever can: four of the six guard branches would be unreachable and the other
// two would fire for the wrong reason.
vi.mock('../agents/directSearch.js', async (orig) => {
  const stub = await import('./harness/searchBackendStub.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    executeDirectSearch: stub.fakeExecuteDirectSearch,
    executeDirectWebSearch: stub.fakeExecuteDirectWebSearch,
    executeDirectExamplesSearch: stub.fakeExecuteDirectExamplesSearch,
    executeDirectPressemitteilungExamples: stub.fakeExecuteDirectPressemitteilungExamples,
  };
});
// NOT mocked here, unlike every sibling file: agenticRespondService. Doubling it
// is exactly what puts the loop out of reach.
//
// `ai` is replaced instead. `loopEngine` imports streamText/generateText at
// module scope into `defaultDeps`, and `runAgenticLoop(p, deps = defaultDeps)`
// reads them from there — so this reaches the loop without threading anything
// through the router. Partial spread: `tool`, `isStepCount`,
// `convertToModelMessages` and the rest must stay real.
vi.mock('ai', async (orig) => {
  const { fakeLoopStreamText, fakeLoopGenerateText } = await import('./harness/loopScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamText: fakeLoopStreamText,
    generateText: fakeLoopGenerateText,
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

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createAiWorkerPoolStub } = await import('./harness/aiWorkerPoolStub.js');
const { createJournalCapture } = await import('./harness/journalCapture.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { loopScript } = await import('./harness/loopScript.js');
const { searchBackend } = await import('./harness/searchBackendStub.js');
const { renderDecisionMap } = await import('../../../evals/renderDecisionMap.js');
const { LOOP_SCENARIOS } = await import('./loopScenarios.js');

const MAPS_DIR = path.join(import.meta.dirname, 'decisions');
const UPDATE = process.env.SIM_UPDATE === '1';

const pool = createAiWorkerPoolStub();
const capture = createJournalCapture();
let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp({ aiWorkerPool: pool, decisionJournal: capture.middleware });
  if (UPDATE && !existsSync(MAPS_DIR)) mkdirSync(MAPS_DIR, { recursive: true });
});

afterAll(async () => {
  await app.close();
  restoreNetwork();
});

beforeEach(() => {
  pinChatEnv();
  resetThreadStore();
  resetMockControls();
  respond.reset();
  pool.reset();
  capture.reset();
  loopScript.reset();
  searchBackend.reset();
});

describe('loop decision maps', () => {
  it.each(LOOP_SCENARIOS.map((s) => [s.id, s] as const))('%s', async (_id, scenario) => {
    expect(
      scenario.note.trim().length,
      `${scenario.id} needs a model-assumption note`
    ).toBeGreaterThan(0);

    searchBackend.failNext = scenario.backendFailures ?? 0;
    loopScript.script(...scenario.streams);

    // No `expectError` escape hatch on purpose. Even the both-passes-degenerate
    // scenario reaches `done` — the loop returns empty and the caller's honest
    // no-answer fallback writes the text — so every scenario here keeps the
    // harness's most important rail (`trace.error === null`) armed.
    const { trace } = await runTurn(app.baseUrl, { messages: [userTurn(scenario.prompt)] });

    // A queued stream nobody consumed means the turn took a different shape than
    // the scenario claims — unified instead of split, or a retry that never
    // happened. Without this the scenario pins a path it never took.
    loopScript.assertScriptsConsumed();

    const journal = capture.last();

    // Render (and under SIM_UPDATE write) BEFORE asserting: if the semantic
    // assertions ran first they would throw and the map would never regenerate,
    // leaving a bare failure instead of the causal chain that explains it.
    const rendered = renderDecisionMap(scenario.id, scenario.category, [
      { prompt: scenario.prompt, journal, trace },
    ]);
    const mapPath = path.join(MAPS_DIR, `${scenario.id}.txt`);
    if (UPDATE) writeFileSync(mapPath, rendered, 'utf8');

    for (const expected of scenario.mustDecide ?? []) {
      const hit = journal.entries.find(
        (e) => e.point === expected.point && e.chose === expected.chose
      );
      expect(
        hit,
        `${scenario.id}: expected ${expected.point} = ${expected.chose}, got ` +
          (journal.entries
            .filter((e) => e.point === expected.point)
            .map((e) => e.chose)
            .join(', ') || '(not reached)')
      ).toBeDefined();
    }

    for (const expected of scenario.decisionCounts ?? []) {
      const taken = journal.entries.filter(
        (e) => e.point === expected.point && e.chose === expected.chose
      );
      expect(
        taken.length,
        `${scenario.id}: expected ${expected.point} = ${expected.chose} exactly ` +
          `${expected.count}x, journal has ` +
          (journal.entries
            .filter((e) => e.point === expected.point)
            .map((e) => e.chose)
            .join(', ') || '(not reached)')
      ).toBe(expected.count);
    }

    for (const point of scenario.notReached ?? []) {
      expect(
        journal.entries.filter((e) => e.point === point).map((e) => e.chose),
        `${scenario.id}: ${point} should not have been evaluated on this path`
      ).toEqual([]);
    }

    if (UPDATE) return;
    if (!existsSync(mapPath)) {
      throw new Error(
        `no committed decision map for "${scenario.id}". Regenerate with ` +
          `SIM_UPDATE=1 and review the diff before committing.\n\n${rendered}`
      );
    }
    expect(rendered, `decision map drifted for "${scenario.id}" — review, then SIM_UPDATE=1`).toBe(
      readFileSync(mapPath, 'utf8')
    );
  });
});
