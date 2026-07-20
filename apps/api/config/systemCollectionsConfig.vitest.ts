import { describe, expect, it } from 'vitest';

import { COLLECTION_MAP } from './collectionMap.js';
import {
  SYSTEM_COLLECTIONS,
  getSystemCollectionConfig,
  getMcpExposedCollections,
  getSearchableSystemCollectionIds,
  getDefaultMultiCollectionIds,
  getCanonicalByKey,
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
