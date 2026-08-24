import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * One allowance, two engines.
 *
 * `@deepresearch` is answered by the research agent, or — when that one cannot
 * run — by Linkup's one-shot dossier. Both meter through the SAME Redis key, and
 * each used to carry its own limit against it (agent 3, dossier 1). The verdict
 * therefore depended on which engine happened to ask: at a count of 2 the agent
 * went ahead while the dossier refused, and a single agent run locked the
 * dossier out for the rest of the day — so the fallback that exists precisely
 * for a failing agent could not fire.
 *
 * The cases below hold both halves of the fix: one number for both engines, and
 * neither engine holding a second opinion about it.
 */

const USER = 'user-1';

// Hoisted, because the `utils/redis` factory below is evaluated at import time
// and would otherwise close over an uninitialised binding.
const { fakeRedis } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    fakeRedis: {
      store,
      isReady: true,
      get: (key: string) => Promise.resolve(store.get(key) ?? null),
      incr: (key: string) => {
        const next = (parseInt(store.get(key) ?? '0', 10) || 0) + 1;
        store.set(key, String(next));
        return Promise.resolve(next);
      },
      expire: () => Promise.resolve(true),
      del: (...keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve(keys.length);
      },
    },
  };
});

const runDeepAgentResearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const linkupDeepResearch = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../../utils/redis/index.js', () => ({ redisClient: fakeRedis }));
vi.mock('../../../config/env.js', () => ({ env: { CORTECS_API_KEY: 'sk-test' } }));
vi.mock('../../../services/research/deepAgent/index.js', () => ({
  runDeepAgentResearch: (...args: unknown[]) => runDeepAgentResearch(...args),
}));
vi.mock('../../../services/docs/DocGenerationService.js', () => ({
  createDocumentWithContent: () => Promise.resolve({ id: 'doc-42' }),
}));
vi.mock('../../../services/research/deepAgent/runRegistry.js', () => ({
  recordRunDocument: () => Promise.resolve(),
}));
vi.mock('../../../services/search/LinkupService.js', () => ({
  getLinkupService: () => ({ deepResearch: (...args: unknown[]) => linkupDeepResearch(...args) }),
}));

const { checkDeepResearchQuota, chargeDeepResearch, DEEP_RESEARCH_DAILY_LIMIT } =
  await import('./deepResearchQuota.js');
const { runDeepAgentTurn } = await import('./deepAgentTurn.js');
const { runDeepResearchTurn } = await import('./deepResearchTurn.js');

/** Puts the shared key at a given count for today, the way a day's use would. */
function seedCount(count: number): void {
  const today = new Date().toISOString().split('T')[0];
  fakeRedis.store.set(`deep_research:${USER}:${today}`, String(count));
}

function currentCount(): number {
  const today = new Date().toISOString().split('T')[0];
  return parseInt(fakeRedis.store.get(`deep_research:${USER}:${today}`) ?? '0', 10) || 0;
}

const STATE = {
  searchQuery: 'Wiens Klimaziel 2040',
  userLocale: 'de-AT',
  agentConfig: { userId: USER },
};

const sse = () => ({
  sent: [] as { event: string; payload: unknown }[],
  send(event: string, payload: unknown) {
    this.sent.push({ event, payload });
  },
  isEnded: () => false,
});

/** The two casts mark the boundary of the doubles: `STATE` is the handful of
 *  fields these turns read out of a ChatGraphState with dozens, and the writer
 *  above only records. */
const agentTurn = () =>
  runDeepAgentTurn({
    state: STATE as unknown as Parameters<typeof runDeepAgentTurn>[0]['state'],
    sse: sse() as unknown as Parameters<typeof runDeepAgentTurn>[0]['sse'],
  });

const dossierTurn = () =>
  runDeepResearchTurn({
    state: STATE as unknown as Parameters<typeof runDeepResearchTurn>[0]['state'],
    sse: sse() as unknown as Parameters<typeof runDeepResearchTurn>[0]['sse'],
  });

beforeEach(() => {
  vi.clearAllMocks();
  fakeRedis.store.clear();
  fakeRedis.isReady = true;
  runDeepAgentResearch.mockResolvedValue({
    markdown: '# Bericht\n\n## Quellen\n\n1. A — https://a.example',
    title: 'Bericht',
    summary: 'Wien will 2040 klimaneutral sein.',
    partial: false,
    threadId: 't-1',
    sources: [{ url: 'https://a.example', title: 'A' }],
  });
  linkupDeepResearch.mockResolvedValue({
    answer: 'Wien will 2040 klimaneutral sein [1].',
    sources: [{ name: 'A', url: 'https://a.example', snippet: 'Klimaziel 2040' }],
  });
});

describe('the shared allowance', () => {
  it('reports the same verdict for every count, since only one limit exists', async () => {
    for (let count = 0; count < DEEP_RESEARCH_DAILY_LIMIT; count++) {
      seedCount(count);
      const quota = await checkDeepResearchQuota(USER);
      expect(quota).toMatchObject({ canResearch: true, count, limit: DEEP_RESEARCH_DAILY_LIMIT });
    }

    seedCount(DEEP_RESEARCH_DAILY_LIMIT);
    expect(await checkDeepResearchQuota(USER)).toMatchObject({ canResearch: false, remaining: 0 });
  });

  it('names the reset time, which every refusal message needs', async () => {
    expect((await checkDeepResearchQuota(USER)).resetIn).toMatch(/^(\d+h )?\d+m$/);
  });

  it('charges one run against the shared key', async () => {
    await chargeDeepResearch(USER);
    expect(currentCount()).toBe(1);
  });

  it('swallows a Redis failure rather than losing an answer already produced', async () => {
    fakeRedis.isReady = false;
    await expect(chargeDeepResearch(USER)).resolves.toBeUndefined();
  });
});

/**
 * The regression itself. A count of 2 is the number that used to split the two
 * engines — under the agent's limit of 3, over the dossier path's 1.
 */
describe('neither engine holds a second opinion about the allowance', () => {
  it('serves the agent at a count of 2', async () => {
    seedCount(2);

    expect(await agentTurn()).toMatchObject({ deepResearchAnswer: expect.any(String) });
    expect(runDeepAgentResearch).toHaveBeenCalledOnce();
  });

  it('serves the dossier at the SAME count of 2', async () => {
    seedCount(2);

    expect(await dossierTurn()).toMatchObject({ deepResearchAnswer: expect.any(String) });
    expect(linkupDeepResearch).toHaveBeenCalledOnce();
  });

  it('serves the dossier right after an agent run has charged the shared key', async () => {
    seedCount(0);
    await agentTurn();
    expect(currentCount()).toBe(1);

    // Used to be the dead end: one agent run put the count at the dossier
    // path's own limit, so its fallback could never fire again that day.
    expect(await dossierTurn()).toMatchObject({ deepResearchAnswer: expect.any(String) });
    expect(currentCount()).toBe(2);
  });

  it('leaves the refusal to the caller — an exhausted key stops neither engine', async () => {
    seedCount(DEEP_RESEARCH_DAILY_LIMIT);

    expect(await agentTurn()).not.toBeNull();
    seedCount(DEEP_RESEARCH_DAILY_LIMIT);
    expect(await dossierTurn()).not.toBeNull();
  });
});
