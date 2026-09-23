/**
 * The admin gate on the glossary handlers, plus the status mapping of the
 * text handler: budget → 429 with the quota, DeepL 400 → 400, outage → 502,
 * no key → 503. Handlers are called directly; auth is a prefix concern.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../utils/contractValidationLogger.js', () => ({
  logContractValidationError: () => () => {},
}));
const requireInstanceAdmin = vi.fn();
vi.mock('../../utils/adminAuthz.js', () => ({
  requireInstanceAdmin: (...a: unknown[]) => requireInstanceAdmin(...a),
}));
const service = {
  getGlossary: vi.fn(),
  getDictionaryEntries: vi.fn(),
  replaceDictionary: vi.fn(),
  createGlossary: vi.fn(),
  deleteDictionary: vi.fn(),
  getLanguages: vi.fn(),
};
const deepl = vi.hoisted(() => ({ available: true }));
vi.mock('../../services/translation/DeepLService.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/translation/DeepLService.js')>();
  return { ...mod, getDeepLService: () => (deepl.available ? service : null) };
});
const translateWithGlossary = vi.fn();
vi.mock('../../services/translation/translate.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../services/translation/translate.js')>();
  return { ...mod, translateWithGlossary: (...a: unknown[]) => translateWithGlossary(...a) };
});
const resolveGlossary = vi.fn();
vi.mock('../../services/translation/glossaryRegistry.js', async (importOriginal) => {
  const mod =
    await importOriginal<typeof import('../../services/translation/glossaryRegistry.js')>();
  return {
    ...mod,
    resolveGlossary: (...a: unknown[]) => resolveGlossary(...a),
    invalidateGlossaryInfo: vi.fn(),
    registerGlossary: vi.fn(),
    glossaryName: () => 'Grünerator',
  };
});
const BALANCE = {
  usedUnits: 0,
  limitUnits: 1000,
  remainingUnits: 1000,
  resetsAt: new Date('2026-09-19T00:00:00.000Z'),
  newsletterBonus: false,
};
vi.mock('../../services/trees/index.js', () => ({
  getTreeBudget: () => ({ status: () => Promise.resolve(BALANCE) }),
}));

const { translationContractRouter } = await import('./translationContractRouter.js');
const { DeepLError } = await import('../../services/translation/DeepLService.js');
const { TreeBudgetExceededError, TreeBudgetUnavailableError } =
  await import('../../services/trees/treeBudget.js');

type Handler = (args: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;
const router = translationContractRouter as unknown as Record<string, Handler>;
const req = { user: { id: 'u1', email: 'a@b.c' } };

beforeEach(() => {
  deepl.available = true;
  requireInstanceAdmin.mockReset().mockResolvedValue(true);
  translateWithGlossary.mockReset();
  resolveGlossary.mockReset().mockResolvedValue({ glossaryId: 'g-1', pairs: ['de>en'] });
  for (const fn of Object.values(service)) fn.mockReset();
});

describe('translateText', () => {
  const body = { text: 'Hallo', targetLang: 'en-GB' };

  it('returns the facade result on success', async () => {
    const result = {
      text: 'Hello',
      detectedSourceLang: 'de',
      targetLang: 'en-GB',
      billedCharacters: 5,
      glossaryApplied: false,
      quota: { used: 0.05, limit: 10, remaining: 9.95, resetsAt: 'x', newsletterBonus: false },
    };
    translateWithGlossary.mockResolvedValue(result);
    await expect(router.translateText!({ req, body })).resolves.toEqual({
      status: 200,
      body: result,
    });
  });

  it('maps the budget refusal to 429 with the quota in Bäume', async () => {
    translateWithGlossary.mockRejectedValue(
      new TreeBudgetExceededError({ ...BALANCE, usedUnits: 1000, remainingUnits: 0 }, 100)
    );
    const res = await router.translateText!({ req, body });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      quota: { used: 10, limit: 10, remaining: 0 },
    });
  });

  it('maps an unreadable budget to 503', async () => {
    translateWithGlossary.mockRejectedValue(new TreeBudgetUnavailableError());
    const res = await router.translateText!({ req, body });
    expect(res.status).toBe(503);
    // `code` is the only thing that tells this 503 from the no-key one; the
    // web hook renders the latter as a notice and would swallow the sentence.
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringContaining('Kontingent'),
      code: 'budget_unavailable',
    });
  });

  it('maps DeepL 400 to 400 and an outage to 502', async () => {
    translateWithGlossary.mockRejectedValueOnce(new DeepLError('DeepL 400: bad', 400));
    expect((await router.translateText!({ req, body })).status).toBe(400);
    translateWithGlossary.mockRejectedValueOnce(new DeepLError('DeepL 503: down', 503));
    expect((await router.translateText!({ req, body })).status).toBe(502);
  });
});

describe('getLanguages', () => {
  it('reports the shared daily budget beside the languages', async () => {
    service.getLanguages.mockResolvedValue([]);
    const res = await router.getLanguages!({ req });
    expect(res).toEqual({
      status: 200,
      body: {
        languages: [],
        glossaryPairs: ['de>en'],
        quota: {
          used: 0,
          limit: 10,
          remaining: 10,
          resetsAt: BALANCE.resetsAt.toISOString(),
          newsletterBonus: false,
        },
      },
    });
  });
});

describe('glossary admin gate', () => {
  it('refuses non-admins on all three handlers', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    expect((await router.getGlossary!({ req })).status).toBe(403);
    expect(
      (
        await router.putGlossaryDictionary!({
          req,
          body: { sourceLang: 'de', targetLang: 'en', entries: [] },
        })
      ).status
    ).toBe(403);
    expect(
      (
        await router.deleteGlossaryDictionary!({
          req,
          query: { sourceLang: 'de', targetLang: 'en' },
        })
      ).status
    ).toBe(403);
    expect(service.getGlossary).not.toHaveBeenCalled();
  });

  it('answers 503 when no key is configured', async () => {
    deepl.available = false;
    expect(await router.getGlossary!({ req })).toMatchObject({
      status: 503,
      body: { code: 'not_configured' },
    });
    expect(await router.getLanguages!({ req })).toMatchObject({
      status: 503,
      body: { code: 'not_configured' },
    });
  });

  it('returns an empty glossary shell when none exists yet', async () => {
    resolveGlossary.mockResolvedValue(null);
    await expect(router.getGlossary!({ req })).resolves.toEqual({
      status: 200,
      body: { glossaryId: null, name: 'Grünerator', dictionaries: [] },
    });
  });

  it('reads every dictionary with its entries', async () => {
    service.getGlossary.mockResolvedValue({
      glossaryId: 'g-1',
      name: 'Grünerator',
      dictionaries: [{ sourceLang: 'de', targetLang: 'en', entryCount: 1 }],
      creationTime: 'x',
    });
    service.getDictionaryEntries.mockResolvedValue([{ source: 'Hallo', target: 'Hello' }]);
    const res = await router.getGlossary!({ req });
    expect(res.body).toEqual({
      glossaryId: 'g-1',
      name: 'Grünerator',
      dictionaries: [
        { sourceLang: 'de', targetLang: 'en', entries: [{ source: 'Hallo', target: 'Hello' }] },
      ],
    });
  });

  it('creates the glossary on the first save and replaces afterwards', async () => {
    const body = { sourceLang: 'de', targetLang: 'en', entries: [{ source: 'a', target: 'b' }] };
    resolveGlossary.mockResolvedValueOnce(null);
    service.createGlossary.mockResolvedValue({
      glossaryId: 'g-new',
      name: 'Grünerator',
      dictionaries: [],
      creationTime: 'x',
    });
    expect((await router.putGlossaryDictionary!({ req, body })).status).toBe(200);
    expect(service.createGlossary).toHaveBeenCalledWith('Grünerator', [
      { sourceLang: 'de', targetLang: 'en', entries: body.entries },
    ]);

    expect((await router.putGlossaryDictionary!({ req, body })).status).toBe(200);
    expect(service.replaceDictionary).toHaveBeenCalledWith(
      'g-1',
      { sourceLang: 'de', targetLang: 'en' },
      body.entries
    );
  });

  it('404s a delete for a pair without a dictionary', async () => {
    const res = await router.deleteGlossaryDictionary!({
      req,
      query: { sourceLang: 'fr', targetLang: 'en' },
    });
    expect(res.status).toBe(404);
    expect(service.deleteDictionary).not.toHaveBeenCalled();
  });
});
