import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test re-imports catalog.ts fresh so the module-level in-memory catalog
// (currentCatalog / lastFetchedAt) never leaks between cases.
async function freshCatalog() {
  vi.resetModules();
  return import('./catalog.ts');
}

describe('catalog static fallback', () => {
  it('exposes abgeordnetenwatch but not the agent-only ricarda collection', async () => {
    const { getCatalog } = await freshCatalog();
    const keys = Object.keys(getCatalog());
    expect(keys).toContain('abgeordnetenwatch');
    expect(keys).toContain('examples');
    expect(keys).not.toContain('ricarda-lang-tweets');
  });

  it('resolves the Qdrant collection name for a shared LV collection', async () => {
    const { getQdrantCollectionName } = await freshCatalog();
    expect(getQdrantCollectionName('bayern')).toBe('landesverbaende_documents');
    expect(getQdrantCollectionName('deutschland')).toBe('grundsatz_documents');
    expect(getQdrantCollectionName('does-not-exist')).toBeUndefined();
  });

  it('validates known collection keys', async () => {
    const { isValidCollectionKey } = await freshCatalog();
    expect(isValidCollectionKey('hessen')).toBe(true);
    expect(isValidCollectionKey('nope')).toBe(false);
  });
});

describe('getDefaultSearchCollections', () => {
  it('includes country-agnostic + matching-country collections with includeInDefaultSearch', async () => {
    const { getDefaultSearchCollections } = await freshCatalog();
    const de = getDefaultSearchCollections('DE');
    expect(de).toContain('deutschland'); // DE + includeInDefaultSearch
    expect(de).toContain('kommunalwiki'); // country-agnostic + includeInDefaultSearch
    expect(de).not.toContain('oesterreich'); // AT-only
    expect(de).not.toContain('bayern'); // includeInDefaultSearch: false
    expect(de).not.toContain('abgeordnetenwatch'); // includeInDefaultSearch: false
  });

  it('scopes AT correctly', async () => {
    const { getDefaultSearchCollections } = await freshCatalog();
    const at = getDefaultSearchCollections('AT');
    expect(at).toContain('oesterreich');
    expect(at).toContain('gruene-at');
    expect(at).toContain('kommunalwiki'); // country-agnostic
    expect(at).not.toContain('deutschland'); // DE-only
  });
});

describe('buildCollectionDefaultFilter', () => {
  it('builds an "any" match for a multi-value LV filter (bayern incl. BY-F)', async () => {
    const { buildCollectionDefaultFilter } = await freshCatalog();
    expect(buildCollectionDefaultFilter('bayern')).toEqual({
      must: [{ key: 'landesverband', match: { any: ['BY', 'BY-F'] } }],
    });
  });

  it('builds a single "value" match for a single-value LV filter', async () => {
    const { buildCollectionDefaultFilter } = await freshCatalog();
    expect(buildCollectionDefaultFilter('hamburg')).toEqual({
      must: [{ key: 'landesverband', match: { value: 'HH' } }],
    });
  });

  it('returns null for a collection without a default filter', async () => {
    const { buildCollectionDefaultFilter } = await freshCatalog();
    expect(buildCollectionDefaultFilter('deutschland')).toBeNull();
  });
});

describe('fetchCatalog', () => {
  const OLD_URL = process.env.GRUENERATOR_API_URL;

  afterEach(() => {
    if (OLD_URL === undefined) delete process.env.GRUENERATOR_API_URL;
    else process.env.GRUENERATOR_API_URL = OLD_URL;
    vi.unstubAllGlobals();
  });

  it('keeps the static fallback (never throws) when GRUENERATOR_API_URL is unset', async () => {
    delete process.env.GRUENERATOR_API_URL;
    const { fetchCatalog, getCatalog } = await freshCatalog();
    await expect(fetchCatalog()).resolves.toBeUndefined();
    expect(Object.keys(getCatalog())).toContain('deutschland');
  });

  it('adapts the array API response into the keyed-object internal shape', async () => {
    process.env.GRUENERATOR_API_URL = 'https://api.example.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          collections: [
            {
              key: 'newland',
              qdrantCollection: 'newland_documents',
              displayName: 'Grüne Newland',
              description: 'Test',
              country: 'DE',
              includeInDefaultSearch: true,
              filterableFields: [
                { field: 'content_type', label: 'Typ', type: 'keyword' },
                { field: 'published_at', label: 'Datum', type: 'date_range' },
              ],
            },
          ],
        }),
      })
    );

    const { fetchCatalog, getCatalog, getDefaultSearchCollections } = await freshCatalog();
    await fetchCatalog();

    const cat = getCatalog();
    expect(Object.keys(cat)).toEqual(['newland']); // live catalog replaced the fallback
    const newland = cat.newland!;
    expect(newland.name).toBe('newland_documents'); // qdrantCollection -> name
    // array filterableFields -> keyed object
    expect(newland.filterableFields).toEqual({
      content_type: { label: 'Typ', type: 'keyword' },
      published_at: { label: 'Datum', type: 'date_range' },
    });
    // a newly-added collection is immediately searchable in the default set
    expect(getDefaultSearchCollections('DE')).toContain('newland');
  });

  it('keeps the current catalog (never throws) on a network error', async () => {
    process.env.GRUENERATOR_API_URL = 'https://api.example.test';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    const { fetchCatalog, getCatalog } = await freshCatalog();
    await expect(fetchCatalog()).resolves.toBeUndefined();
    expect(Object.keys(getCatalog())).toContain('deutschland'); // fallback intact
  });
});
