import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: { DEEPL_GLOSSARY_NAME: 'Grünerator' } }));
const warn = vi.fn();
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }),
}));
const redis = { get: vi.fn(), set: vi.fn() };
vi.mock('../../utils/redis/client.js', () => ({ default: redis }));
const getCachedJson = vi.fn();
const setCachedJson = vi.fn();
const deleteCachedKey = vi.fn();
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson,
  setCachedJson,
  deleteCachedKey,
}));

const { resolveGlossary, glossaryIdFor, pairKey } = await import('./glossaryRegistry.js');
const { DeepLError } = await import('./DeepLService.js');

const glossary = (id: string, creationTime: string, name = 'Grünerator') => ({
  glossaryId: id,
  name,
  dictionaries: [{ sourceLang: 'de', targetLang: 'en', entryCount: 2 }],
  creationTime,
});

const service = { getGlossary: vi.fn(), listGlossaries: vi.fn() };
const svc = service as unknown as import('./DeepLService.js').DeepLService;

beforeEach(() => {
  redis.get.mockReset().mockResolvedValue(null);
  redis.set.mockReset().mockResolvedValue('OK');
  getCachedJson.mockReset().mockResolvedValue(null);
  setCachedJson.mockReset();
  service.getGlossary.mockReset();
  service.listGlossaries.mockReset();
  warn.mockReset();
});

describe('resolveGlossary', () => {
  it('uses the remembered id without listing', async () => {
    redis.get.mockResolvedValue('g-1');
    service.getGlossary.mockResolvedValue(glossary('g-1', '2026-01-01T00:00:00Z'));

    const info = await resolveGlossary(svc);

    expect(info).toEqual({ glossaryId: 'g-1', pairs: ['de>en'] });
    expect(service.listGlossaries).not.toHaveBeenCalled();
    expect(setCachedJson).toHaveBeenCalledWith('deepl:glossary:info:v1', info, 600);
  });

  it('falls back to name lookup when the remembered id is gone and picks the newest', async () => {
    redis.get.mockResolvedValue('old');
    service.getGlossary.mockRejectedValue(new DeepLError('DeepL 404', 404));
    service.listGlossaries.mockResolvedValue([
      glossary('g-old', '2025-01-01T00:00:00Z'),
      glossary('g-new', '2026-01-01T00:00:00Z'),
      glossary('g-other', '2026-05-01T00:00:00Z', 'Anderes'),
    ]);

    const info = await resolveGlossary(svc);

    expect(info?.glossaryId).toBe('g-new');
    expect(redis.set).toHaveBeenCalledWith('deepl:glossary:id', 'g-new');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('2 glossaries named'));
  });

  it('returns null when no glossary carries the configured name', async () => {
    service.listGlossaries.mockResolvedValue([glossary('x', '2026-01-01T00:00:00Z', 'Fremd')]);
    await expect(resolveGlossary(svc)).resolves.toBeNull();
    expect(setCachedJson).not.toHaveBeenCalled();
  });

  it('serves the cached info without DeepL', async () => {
    getCachedJson.mockResolvedValue({ glossaryId: 'g-1', pairs: ['de>en'] });
    await resolveGlossary(svc);
    expect(service.getGlossary).not.toHaveBeenCalled();
    expect(service.listGlossaries).not.toHaveBeenCalled();
  });
});

describe('glossaryIdFor', () => {
  it('matches on root languages only', () => {
    const info = { glossaryId: 'g-1', pairs: ['de>en'] };
    expect(glossaryIdFor(info, 'DE', 'en-GB')).toBe('g-1');
    expect(glossaryIdFor(info, 'en', 'de')).toBeNull();
    expect(glossaryIdFor(null, 'de', 'en')).toBeNull();
    expect(pairKey('de-AT', 'EN-US')).toBe('de>en');
  });
});
