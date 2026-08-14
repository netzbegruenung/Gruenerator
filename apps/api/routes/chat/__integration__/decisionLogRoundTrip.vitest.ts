/**
 * The live-lane seam, end to end: correlation header → journal file → reader →
 * rendered map.
 *
 * `simulatedRun.vitest.ts` reads the journal out of memory, which is exactly
 * what the live lane CANNOT do — there the runner and the backend are two
 * processes. So the in-memory path proves nothing about the file path, and the
 * file path is where the fiddly parts are: the header naming the file, the
 * write firing on `close` rather than `finish`, the reader waiting for a flush
 * it does not control, and `/resume` landing in a second file that has to be
 * merged into the same turn.
 *
 * The router, the classifier and the guards are real here, as in every file in
 * this directory; only the model is scripted. What is under test is the
 * transport, not the decisions — a single turn is enough, and this file stays
 * deliberately small so the ~7 s router import is paid for something narrow.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const { pinChatEnv } = await import('./harness/env.js');
const { resetThreadStore } = await import('./harness/fakeThreadStore.js');
const { resetMockControls } = await import('./harness/mocks.js');
const { respond } = await import('./harness/respondScript.js');
const { decisionLogMiddleware } = await import('../../../utils/decisionLog.js');
const { readDecisionJournal, mergeJournals } = await import('../../../evals/decisionLog.js');
const { renderDecisionMap } = await import('../../../evals/renderDecisionMap.js');

const pool = createAiClientStub();
let logDir: string;
let app: Awaited<ReturnType<typeof startChatApp>>;
let restoreNetwork: () => void;

beforeAll(async () => {
  restoreNetwork = installNetworkGuard();
  logDir = mkdtempSync(path.join(tmpdir(), 'chat-decision-'));
  // The middleware production mounts, with the env injected rather than read:
  // vitest runs under NODE_ENV=test, and config/env.ts parses process.env once
  // at import, so the real gate could not be exercised any other way.
  const middleware = decisionLogMiddleware({
    NODE_ENV: 'development',
    CHAT_DECISION_LOG_DIR: logDir,
  });
  if (!middleware) throw new Error('decision log middleware should have been constructed');
  app = await startChatApp({ aiClient: pool, decisionJournal: middleware });
});

afterAll(async () => {
  await app.close();
  restoreNetwork();
  rmSync(logDir, { recursive: true, force: true });
});

beforeEach(() => {
  pinChatEnv();
  resetThreadStore();
  resetMockControls();
  respond.reset();
  pool.reset();
});

describe('decision log round trip', () => {
  it('writes one file per turn, named by the correlation header', async () => {
    await runTurn(
      app.baseUrl,
      { messages: [userTurn('Was ist Windkraft?')] },
      {
        headers: { 'x-decision-log-id': 'roundtrip-1.t0' },
      }
    );

    const journal = await readDecisionJournal(logDir, 'roundtrip-1.t0');
    expect(journal, 'no journal file appeared for the sent correlation id').not.toBeNull();
    expect(
      journal?.entries.length,
      'a turn that decided nothing means nothing was recorded'
    ).toBeGreaterThan(0);
    expect(journal?.entries.map((e) => e.point)).toContain('router.run_agentic');
  });

  it('renders the same map the simulated lane renders, with the live caveat', async () => {
    const { trace } = await runTurn(
      app.baseUrl,
      { messages: [userTurn('Was ist Windkraft?')] },
      {
        headers: { 'x-decision-log-id': 'roundtrip-2.t0' },
      }
    );
    const journal = await readDecisionJournal(logDir, 'roundtrip-2.t0');
    if (!journal) throw new Error('no journal file');

    const rendered = renderDecisionMap(
      'roundtrip-2',
      'transport',
      [{ prompt: 'Was ist Windkraft?', journal, trace }],
      'live'
    );

    expect(rendered).toContain('# LIVE decision map');
    expect(rendered).not.toContain('SIM_UPDATE');
    // Every registry point is printed, reached or not — that is the property
    // that makes "this guard stopped firing" visible at all.
    expect(rendered).toContain('router.run_agentic');
    expect(rendered).toContain('loop.tool_guard');
    expect(rendered).toContain('-- wire --');
  });

  it('does not write for a request that sent no correlation id, beyond a counter name', async () => {
    const before = new Set(readdirSync(logDir));
    await runTurn(app.baseUrl, { messages: [userTurn('Was ist Solarenergie?')] });
    const added = readdirSync(logDir).filter((f) => !before.has(f));
    // A file is still written — the sink is on for the whole mount — but under a
    // generated name, so an unlabelled turn can never overwrite a labelled one.
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/^req-\d+\.json$/);
  });

  it('returns null instead of throwing when the backend logged nothing', async () => {
    expect(await readDecisionJournal(logDir, 'never-sent')).toBeNull();
  });

  it('merges a turn and its resume continuation into one journal', async () => {
    await runTurn(
      app.baseUrl,
      { messages: [userTurn('Was ist Windkraft?')] },
      {
        headers: { 'x-decision-log-id': 'merge-1.t0' },
      }
    );
    await runTurn(
      app.baseUrl,
      { messages: [userTurn('Was ist Solarenergie?')] },
      {
        headers: { 'x-decision-log-id': 'merge-1.t0.resume' },
      }
    );

    const primary = await readDecisionJournal(logDir, 'merge-1.t0');
    const resumed = await readDecisionJournal(logDir, 'merge-1.t0.resume');
    const merged = mergeJournals([primary, resumed]);

    expect(merged.entries).toHaveLength(
      (primary?.entries.length ?? 0) + (resumed?.entries.length ?? 0)
    );
    // seq is renumbered across the join: two files each starting at 0 would
    // otherwise give the renderer two entries claiming the same position.
    expect(merged.entries.map((e) => e.seq)).toEqual(merged.entries.map((_, i) => i));
  });
});
