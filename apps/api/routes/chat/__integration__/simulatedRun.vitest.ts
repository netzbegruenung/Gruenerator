/**
 * Simulated prompt runs with a committed decision map.
 *
 * Realistic prompts go through the real router, the real classifier and the
 * real guards; only the model is scripted. Each run records WHICH decisions
 * were taken (apps/api/utils/decisionJournal.ts) and renders them next to what
 * reached the wire. The rendered map is committed, so a regression arrives as a
 * diff that names the guard that stopped firing and the branch that won instead
 * — not as a bare red assertion.
 *
 * Regenerate the maps with SIM_UPDATE=1. A MISSING map file is a failure, never
 * a silent create: otherwise a renamed scenario blesses itself.
 *
 * WHAT THIS PROVES: which branch of a deterministic gate fired, given a fixed
 * model output, and that the gate is still on the path at all.
 * WHAT IT CANNOT PROVE: anything about what a real model does. Every scripted
 * verdict is an assumption (see each scenario's `note`). Groundedness, citation
 * correctness, refusal behaviour and German/Austrian register are measured
 * ONLY by the manual live lane plus the LLM judge in apps/api/evals/.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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

const { startChatApp, userTurn } = await import('./harness/testApp.js');
const { runTurn, installNetworkGuard } = await import('./harness/trace.js');
const { createAiClientStub } = await import('./harness/aiClientStub.js');
const { createJournalCapture } = await import('./harness/journalCapture.js');
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { renderDecisionMap } = await import('../../../evals/renderDecisionMap.js');
const { SIM_SCENARIOS } = await import('./scenarios.js');

const MAPS_DIR = path.join(import.meta.dirname, 'decisions');
const UPDATE = process.env.SIM_UPDATE === '1';

const pool = createAiClientStub();
const capture = createJournalCapture();
let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  app = await startChatApp({ aiClient: pool, decisionJournal: capture.middleware });
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
});

describe('simulated decision maps', () => {
  it.each(SIM_SCENARIOS.map((s) => [s.id, s] as const))('%s', async (_id, scenario) => {
    expect(
      scenario.note.trim().length,
      `${scenario.id} needs a model-assumption note`
    ).toBeGreaterThan(0);

    if (scenario.env) pinChatEnv(scenario.env);
    if (scenario.generationKind) {
      pool.scriptResolver('Entscheide, ob diese Nachricht ein ARTEFAKT', scenario.generationKind);
    }

    const { trace } = await runTurn(app.baseUrl, {
      messages: [userTurn(scenario.prompt)],
      ...scenario.body,
    });

    // A scripted resolver answer nobody consumed means the turn resolved earlier than
    // the scenario claims — it would pin a path it never took.
    if (scenario.generationKind) pool.assertScriptsConsumed();

    const journal = capture.last();

    // Render and, under SIM_UPDATE, WRITE before asserting. The map is the
    // diagnostic: if the semantic assertions ran first they would throw and the
    // map would never be regenerated, leaving the reviewer with a bare failure
    // instead of the causal chain that explains it.
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
