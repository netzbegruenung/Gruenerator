/**
 * The one-shot download is the whole point: on the first `done` the result is
 * fetched to disk exactly once (SET NX), the quota is settled once, and a
 * concurrent poll neither fetches a second time nor flips the job to error.
 */
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    DEEPL_API_KEY: 'k',
    DEEPL_GLOSSARY_NAME: 'Grünerator',
    DEEPL_DAILY_CHARS_PER_USER: 1_000_000,
  },
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// In-memory Redis: the job store, the fetch lock and the quota counter.
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
    { service: svc, glossary }
  );
}

describe('startDocumentJob', () => {
  it('uploads with a sanitized name, the glossary for the pair, and books nothing yet', async () => {
    const { jobId, filename } = await start();

    expect(service.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'Rede 2026.pdf', sourceLang: 'de', glossaryId: 'g-1' })
    );
    expect(filename).toBe('Rede 2026.pdf');
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(redis.incrBy).not.toHaveBeenCalled();
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
    const status = await pollDocumentJob(jobId, 'u1', { service: svc });
    expect(status).toMatchObject({
      status: 'translating',
      secondsRemaining: 12,
      filename: 'Rede 2026.pdf',
    });
    expect(service.downloadDocument).not.toHaveBeenCalled();
  });

  it('fetches the result to disk once, settles the quota once, and serves the file repeatedly', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'done',
      secondsRemaining: 0,
      billedCharacters: 61_000,
      message: null,
    });

    const [first, second] = await Promise.all([
      pollDocumentJob(jobId, 'u1', { service: svc }),
      pollDocumentJob(jobId, 'u1', { service: svc }),
    ]);
    const third = await pollDocumentJob(jobId, 'u1', { service: svc });

    expect(service.downloadDocument).toHaveBeenCalledTimes(1);
    expect([first?.status, second?.status].sort()).toEqual(['done', 'translating']);
    expect(third).toMatchObject({ status: 'done', billedCharacters: 61_000 });
    expect(redis.incrBy).toHaveBeenCalledTimes(1);
    expect(redis.incrBy).toHaveBeenCalledWith(expect.stringMatching(/^deepl:chars:u1:/), 61_000);

    const file = await documentJobFile(jobId, 'u1');
    expect(file?.filename).toBe('Rede 2026.pdf');
    expect(file?.contentType).toBe('application/pdf');
    expect(fs.readFileSync(file!.path, 'utf8')).toBe('translated');
    expect(await documentJobFile(jobId, 'u1')).not.toBeNull();
    fs.unlinkSync(file!.path);
  });

  it('books the 50 000-character minimum when DeepL bills less', async () => {
    const { jobId } = await start();
    service.getDocumentStatus.mockResolvedValue({
      status: 'done',
      secondsRemaining: 0,
      billedCharacters: 1200,
      message: null,
    });
    await pollDocumentJob(jobId, 'u1', { service: svc });
    expect(redis.incrBy).toHaveBeenCalledWith(expect.any(String), 50_000);
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
    const status = await pollDocumentJob(jobId, 'u1', { service: svc });
    expect(status).toMatchObject({
      status: 'error',
      message: 'Source and target language are equal.',
    });
    expect(service.downloadDocument).not.toHaveBeenCalled();
    expect(await documentJobFile(jobId, 'u1')).toBeNull();
  });

  it('is invisible to another user and to unknown ids', async () => {
    const { jobId } = await start();
    expect(await pollDocumentJob(jobId, 'u2', { service: svc })).toBeNull();
    expect(await pollDocumentJob('not-a-job', 'u1', { service: svc })).toBeNull();
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
