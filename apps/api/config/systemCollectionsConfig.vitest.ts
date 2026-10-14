import { describe, expect, it } from 'vitest';

import { COLLECTION_MAP } from './collectionMap.js';
import { LANDESVERBAENDE_CONFIG } from './landesverbaendeConfig.js';
import {
  SYSTEM_COLLECTIONS,
  contentTypeLabel,
  getSystemCollectionConfig,
  getMcpExposedCollections,
  getSearchableSystemCollectionIds,
  getDefaultMultiCollectionIds,
  getCanonicalByKey,
  getFacetCountFilter,
  offersChoice,
  readerCollectionIdFor,
} from './systemCollectionsConfig.js';

describe('canonical registry invariants', () => {
  it('every entry carries a key and an explicit mcpExposed flag', () => {
    for (const [id, c] of Object.entries(SYSTEM_COLLECTIONS)) {
      expect(c.key, `${id} must have a key`).toBeTruthy();
      expect(typeof c.mcpExposed, `${id} must set mcpExposed`).toBe('boolean');
    }
  });

  it('creates examples-system so getSystemCollectionConfig no longer silently falls back', () => {
    const examples = getSystemCollectionConfig('examples-system');
    expect(examples).toBeDefined();
    expect(examples?.qdrantCollection).toBe('social_media_examples');
    expect(examples?.key).toBe('examples');
  });

  it('creates ricarda-lang-tweets-system as agent-only + not MCP exposed', () => {
    const ricarda = getSystemCollectionConfig('ricarda-lang-tweets-system');
    expect(ricarda).toBeDefined();
    expect(ricarda?.agentOnly).toBe(true);
    expect(ricarda?.mcpExposed).toBe(false);
  });

  it('uses the correct bayern default filter (LV + Fraktion)', () => {
    expect(getSystemCollectionConfig('bayern-system')?.defaultFilter).toEqual({
      field: 'landesverband',
      value: ['BY', 'BY-F'],
    });
  });
});

describe('NLP facet injection', () => {
  const fieldNames = (id: string) =>
    (getSystemCollectionConfig(id)?.filterableFields ?? []).map((f) => f.field);

  it('appends themes/persons to document collections', () => {
    const names = fieldNames('grundsatz-system');
    expect(names).toContain('themes');
    expect(names).toContain('persons');
  });

  it('marks persons research-only and themes not', () => {
    // The split the notebook chat relies on — see
    // routes/notebook/chatFiltersExcludePersons.vitest.ts for the effect.
    const fields = getSystemCollectionConfig('grundsatz-system')?.filterableFields ?? [];
    expect(fields.find((f) => f.field === 'persons')?.researchOnly).toBe(true);
    expect(fields.find((f) => f.field === 'themes')?.researchOnly).toBeUndefined();
  });

  it('excludes examples-system and ricarda from the NLP injection', () => {
    for (const id of ['examples-system', 'ricarda-lang-tweets-system', 'satzungen-system']) {
      const names = fieldNames(id);
      expect(names, `${id} must not get themes`).not.toContain('themes');
      expect(names, `${id} must not get persons`).not.toContain('persons');
    }
  });
});

describe('collection-set helpers', () => {
  it('getMcpExposedCollections includes abgeordnetenwatch, excludes ricarda', () => {
    const keys = getMcpExposedCollections().map((c) => c.key);
    expect(keys).toContain('abgeordnetenwatch');
    expect(keys).not.toContain('ricarda-lang-tweets');
  });

  it('getSearchableSystemCollectionIds excludes agent-only + examples', () => {
    const ids = getSearchableSystemCollectionIds();
    expect(ids).not.toContain('ricarda-lang-tweets-system');
    expect(ids).not.toContain('examples-system');
    expect(ids).toContain('grundsatz-system');
    // default multi-collection search uses the same (safe) set
    expect(getDefaultMultiCollectionIds()).toEqual(ids);
  });

  it('getCanonicalByKey resolves the -system id from the chat-facing key', () => {
    expect(getCanonicalByKey('bayern')?.id).toBe('bayern-system');
    expect(getCanonicalByKey('unknown')).toBeUndefined();
  });
});

describe('derived COLLECTION_MAP', () => {
  it('maps each chat key to its Qdrant collection + system id', () => {
    expect(COLLECTION_MAP.bayern).toEqual({
      qdrantCollection: 'landesverbaende_documents',
      systemId: 'bayern-system',
    });
    expect(COLLECTION_MAP.examples).toEqual({
      qdrantCollection: 'social_media_examples',
      systemId: 'examples-system',
    });
    expect(COLLECTION_MAP['ricarda-lang-tweets']).toEqual({
      qdrantCollection: 'ricarda_lang_tweets',
      systemId: 'ricarda-lang-tweets-system',
    });
  });
});

describe('Landesverband notebook filters', () => {
  it('cover every landesverband code a scraper source writes', () => {
    const covered = new Set<string>();
    for (const c of Object.values(SYSTEM_COLLECTIONS)) {
      if (c.qdrantCollection !== 'landesverbaende_documents') continue;
      if (c.defaultFilter?.field !== 'landesverband') continue;
      const v = c.defaultFilter.value;
      for (const code of Array.isArray(v) ? v : [v]) covered.add(code);
    }
    const uncovered = LANDESVERBAENDE_CONFIG.sources
      .map((s) => s.shortName)
      .filter((code) => !covered.has(code));
    expect(uncovered).toEqual([]);
  });
});

describe('directly offered facets', () => {
  // Landtag notebooks carry ten and more facets; the chat settings and the
  // research toolbar list every one that is not collapsed.
  it('stay at four keyword facets per notebook', () => {
    for (const c of Object.values(SYSTEM_COLLECTIONS)) {
      const direct = c.filterableFields
        .filter((f) => f.type === 'keyword' && !f.collapsed)
        .map((f) => f.label);
      expect(direct.length, `${c.id}: ${direct.join(', ')}`).toBeLessThanOrEqual(4);
    }
  });

  it('count every point of an unchunked collection', () => {
    // social_media_examples has no chunk_index: a head-chunk filter counted 0 (#4269).
    expect(getFacetCountFilter('examples-system')).toEqual({});
    expect(getFacetCountFilter('grundsatz-system')).toEqual({
      must: [{ key: 'chunk_index', match: { value: 0 } }],
    });
  });

  it('need at least two values', () => {
    expect(offersChoice([{ value: '21', count: 30721 }])).toBe(false);
    expect(offersChoice([])).toBe(false);
    expect(offersChoice(null)).toBe(false);
    expect(offersChoice([{ value: 'a' }, { value: 'b' }])).toBe(true);
  });
});

describe('readerCollectionIdFor', () => {
  it('maps a chat key and accepts a system id', () => {
    expect(readerCollectionIdFor('brandenburg')).toBe('brandenburg-system');
    expect(readerCollectionIdFor('brandenburg-system')).toBe('brandenburg-system');
  });

  it('refuses agent-only collections, user notebooks and missing ids', () => {
    expect(readerCollectionIdFor('ricarda-lang-tweets')).toBeNull();
    expect(readerCollectionIdFor('ricarda-lang-tweets-system')).toBeNull();
    expect(readerCollectionIdFor('0f8b6c1e-2d4a-4b8e-9c3f-5a6d7e8f9a0b')).toBeNull();
    expect(readerCollectionIdFor(undefined)).toBeNull();
  });
});

describe('contentTypeLabel', () => {
  it('names the document type from the content_type facet labels', () => {
    expect(contentTypeLabel('landtag-nrw-system', 'plenarprotokoll')).toBe('Plenarprotokoll');
    expect(contentTypeLabel('bundestag-dip-system', 'rede')).toBe('Rede');
  });

  it('stays empty for unknown values and collections without labels', () => {
    expect(contentTypeLabel('landtag-nrw-system', 'unbekannt')).toBeNull();
    expect(contentTypeLabel('bundestag-dip-system', null)).toBeNull();
    expect(contentTypeLabel('gruene-de-system', 'artikel')).toBeNull();
  });
});
