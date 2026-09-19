/**
 * The one-shot download is the whole point: on the first `done` the result is
 * fetched to disk exactly once (SET NX), the reservation is corrected once, and
 * a concurrent poll neither fetches a second time nor flips the job to error.
 *
 * The booking is the second contract: a document costs its minimum up front and
 * is corrected on `done` — but DeepL bills only completed documents, so every
 * route to `error` hands the whole reservation back.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type TreeBalance } from '../trees/treeBudget.js';
import { treeCostForChars, TREE_COST_DOCUMENT } from '../trees/treeCosts.js';

vi.mock('../../config/env.js', () => ({
  env: { DEEPL_API_KEY: 'k', DEEPL_GLOSSARY_NAME: 'Grünerator' },
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// In-memory Redis: the job store and the fetch lock. The budget is injected.
const store = new Map<string, string>();
const redis = {
  get: vi.fn(async (k: string) => store.get(k) ?? null),
  set: vi.fn(async (k: string, v: string, opts?: { NX?: boolean; EX?: number }) => {
    if (opts?.NX && store.has(k)) return null;
    store.set(k, v);
    return 'OK';
  }),
  del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  incrBy: vi.fn(async (k: string, n: number) => {
    const next = (parseInt(store.get(k) ?? '0', 10) || 0) + n;
    store.set(k, String(next));
    return next;
  }),
  expire: vi.fn(async () => true),
};
vi.mock('../../utils/redis/client.js', () => ({ default: redis }));

const RESERVED_DAY = '2026-09-18';

/** Books like the real thing so the assertions can read the running total. */
function fakeBudget() {
  let used = 0;
  const balance = (): TreeBalance => ({
    usedUnits: used,
    limitUnits: 1500,
    remainingUnits: 1500 - used,
    resetsAt: new Date('2026-09-19T00:00:00.000Z'),
    newsletterBonus: false,
    day: RESERVED_DAY,
  });
  return {
    usedUnits: () => used,
    reserveOrThrow: vi.fn(async (_userId: string, units: number) => {
      used += units;
      return balance();
    }),
    adjust: vi.fn(async (_userId: string, delta: number, _day: string) => {
      used += delta;
      return balance();
    }),
    release: vi.fn(async (_userId: string, units: number, _day: string) => {
      used -= units;
      return balance();
    }),
  };
}

let budget: ReturnType<typeof fakeBudget>;

const jobs = await import('./documentJobs.js');
const { startDocumentJob, pollDocumentJob, documentJobFile, sweepTranslationFiles } = jobs;

const service = {
  uploadDocument: vi.fn(),
  getDocumentStatus: vi.fn(),
  downloadDocument: vi.fn(),
};
const svc = service as unknown as import('./DeepLService.js').DeepLService;
const glossary = vi.fn(async () => ({ glossaryId: 'g-1', pairs: ['de>en'] }));

beforeEach(() => {
  store.clear();
  budget = fakeBudget();
  service.uploadDocument
    .mockReset()
    .mockResolvedValue({ documentId: 'doc-1', documentKey: 'key-1' });
  service.getDocumentStatus.mockReset();
  service.downloadDocument.mockReset().mockResolvedValue({
    buffer: Buffer.from('translated'),
    contentType: 'application/pdf',
  });
  glossary.mockClear();
});

async function start(over: Partial<Parameters<typeof startDocumentJob>[0]> = {}) {
  return startDocumentJob(
    {
      userId: 'u1',
      buffer: Buffer.from('hello'),
      filename: '../Rede 2026.pdf',
      targetLang: 'en-GB',
      sourceLang: 'de',
      ...over,
    },
    { service: svc, glossary, budget }
  );
}

const poll = (jobId: string, userId = 'u1') =>
  pollDocumentJob(jobId, userId, { service: svc, budget });

describe('startDocumentJob', () => {
  it('uploads with a sanitized name, the glossary for the pair, and books the minimum', async () => {
    const { jobId, filename } = await start();

    expect(service.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Rede 2026.pdf', sourceLang: 'de', glossaryId: 'g-1' })
    );
    expect(filename).toBe('Rede 2026.pdf');
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(budget.reserveOrThrow).toHaveBeenCalledWith('u1', TREE_COST_DOCUMENT);
  });

  it('hands the reservation back when the upload fails', async () => {
    service.uploadDocument.mockRejectedValueOnce(new Error('DeepL 503'));

    await expect(start()).rejects.toThrow('DeepL 503');
    expect(budget.release).toHaveBeenCalledWith('u1', TREE_COST_DOCUMENT, RESERVED_DAY);
    expect(budget.usedUnits()).toBe(0);
  });

  it('renames the output when PDF → DOCX is requested', async () => {
    const { filename } = await start({ outputFormat: 'docx' });
    expect(filename).toBe('Rede 2026.docx');
    expect(service.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ outputFormat: 'docx' })
    );
  });

  it('sends no glossary with an automatic source', async () => {
    await start({ sourceLang: null });
    expect(glossary).not.toHaveBeenCalled();
    expect(service.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ glossaryId: null })
    );
  });
});

describe('pollDocumentJob', () => {
  it('reports progress while DeepL is still translating', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'translating',
      secondsRemaining: 12,
      billedCharacters: null,
      message: null,
    });
    const status = await poll(jobId);
    expect(status).toMatchObject({
      status: 'translating',
      secondsRemaining: 12,
      filename: 'Rede 2026.pdf',
    });
    expect(service.downloadDocument).not.toHaveBeenCalled();
  });

  it('fetches the result to disk once, corrects the booking once, and serves the file repeatedly', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'done',
      secondsRemaining: 0,
      billedCharacters: 61_000,
      message: null,
    });

    const [first, second] = await Promise.all([poll(jobId), poll(jobId)]);
    const third = await poll(jobId);

    expect(service.downloadDocument).toHaveBeenCalledTimes(1);
    expect([first?.status, second?.status].sort()).toEqual(['done', 'translating']);
    expect(third).toMatchObject({ status: 'done', billedCharacters: 61_000 });
    expect(budget.adjust).toHaveBeenCalledTimes(1);
    expect(budget.adjust).toHaveBeenCalledWith(
      'u1',
      treeCostForChars(61_000) - TREE_COST_DOCUMENT,
      RESERVED_DAY
    );
    expect(budget.usedUnits()).toBe(treeCostForChars(61_000));

    const file = await documentJobFile(jobId, 'u1');
    expect(file?.filename).toBe('Rede 2026.pdf');
    expect(file?.contentType).toBe('application/pdf');
    expect(fs.readFileSync(file!.path, 'utf8')).toBe('translated');
    expect(await documentJobFile(jobId, 'u1')).not.toBeNull();
    fs.unlinkSync(file!.path);
  });

  it('keeps the booking at the 50 000-character minimum when DeepL bills less', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'done',
      secondsRemaining: 0,
      billedCharacters: 1200,
      message: null,
    });
    await poll(jobId);
    expect(budget.adjust).toHaveBeenCalledWith('u1', 0, RESERVED_DAY);
    expect(budget.usedUnits()).toBe(TREE_COST_DOCUMENT);
    const file = await documentJobFile(jobId, 'u1');
    if (file) fs.unlinkSync(file.path);
  });

  it('keeps DeepL error messages and never fetches', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'error',
      secondsRemaining: null,
      billedCharacters: null,
      message: 'Source and target language are equal.',
    });
    const status = await poll(jobId);
    expect(status).toMatchObject({
      status: 'error',
      message: 'Source and target language are equal.',
    });
    expect(service.downloadDocument).not.toHaveBeenCalled();
    expect(await documentJobFile(jobId, 'u1')).toBeNull();
    // DeepL bills completed documents only.
    expect(budget.release).toHaveBeenCalledWith('u1', TREE_COST_DOCUMENT, RESERVED_DAY);
    expect(budget.usedUnits()).toBe(0);
  });

  it('hands the reservation back when the finished document cannot be fetched', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'done',
      secondsRemaining: 0,
      billedCharacters: 61_000,
      message: null,
    });
    service.downloadDocument.mockRejectedValueOnce(new Error('gone'));

    expect(await poll(jobId)).toMatchObject({ status: 'error' });
    expect(budget.release).toHaveBeenCalledWith('u1', TREE_COST_DOCUMENT, RESERVED_DAY);
    expect(budget.usedUnits()).toBe(0);
  });

  /** Jobs written before the budget existed carry neither `reservedUnits` nor
   *  `reservedDay` and must neither be dropped by the schema nor booked
   *  against a missing number — the day falls back to the current UTC one. */
  it('treats a job from before the budget as a full reservation on today', async () => {
    const { jobId } = await start();
    const key = `deepl:job:${jobId}`;
    const legacy = JSON.parse(store.get(key)!) as Record<string, unknown>;
    delete legacy.reservedUnits;
    delete legacy.reservedDay;
    store.set(key, JSON.stringify(legacy));
    service.getDocumentStatus.mockResolvedValue({
      status: 'error',
      secondsRemaining: null,
      billedCharacters: null,
      message: 'kaputt',
    });

    expect(await poll(jobId)).toMatchObject({ status: 'error' });
    expect(budget.release).toHaveBeenCalledWith(
      'u1',
      TREE_COST_DOCUMENT,
      new Date().toISOString().slice(0, 10)
    );
  });

  /**
   * The SET NX lock guarded only the `done` fetch, so two polls that both saw
   * `error` handed the same reservation back twice — the counter then ran
   * below zero and paid for the rest of the day.
   */
  it('releases an errored job once, however many polls see it', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'error',
      secondsRemaining: null,
      billedCharacters: null,
      message: 'kaputt',
    });

    const [first, second] = await Promise.all([poll(jobId), poll(jobId)]);

    expect(first).toMatchObject({ status: 'error' });
    expect(second).toMatchObject({ status: 'error' });
    expect(budget.release).toHaveBeenCalledTimes(1);
    expect(budget.usedUnits()).toBe(0);
  });

  it('is invisible to another user and to unknown ids', async () => {
    const { jobId } = await start();
    expect(await poll(jobId, 'u2')).toBeNull();
    expect(await poll('not-a-job')).toBeNull();
    expect(await documentJobFile(jobId, 'u2')).toBeNull();
  });
});

/**
 * The sweep runs against the real, shared `TRANSLATIONS_DIR`, and `startDocumentJob`
 * kicks off its own fire-and-forget sweep over the same directory. The return value is
 * therefore not a property of this test: whoever gets there first deletes the file and
 * counts it, and the loser counts zero. What is pinned here is the rule itself — a file
 * past the TTL is gone, a fresh one stays — and that holds no matter which sweep did it.
 */
describe('sweepTranslationFiles', () => {
  it('removes files older than the job TTL and keeps fresh ones', async () => {
    fs.mkdirSync(jobs.TRANSLATIONS_DIR, { recursive: true });
    const old = path.join(jobs.TRANSLATIONS_DIR, 'old-test.pdf');
    const fresh = path.join(jobs.TRANSLATIONS_DIR, 'fresh-test.pdf');
    fs.writeFileSync(old, 'x');
    fs.writeFileSync(fresh, 'y');
    const past = Date.now() - 3 * 60 * 60 * 1000;
    fs.utimesSync(old, past / 1000, past / 1000);

    await sweepTranslationFiles();

    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    fs.unlinkSync(fresh);
  });
});
