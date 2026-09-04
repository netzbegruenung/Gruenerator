import { describe, expect, it } from 'vitest';

import {
  BM25_CANDIDATES,
  EVAL_BM25_PREFIX,
  bm25CandidatePrefix,
  bm25CollectionName,
  deleteEvalCollections,
  encodeCandidateDocument,
  encodeCandidateQuery,
  getBm25Candidate,
  guardDelete,
  isEvalBm25Collection,
  resolveBm25Candidate,
  resolveBm25Target,
} from './bm25Candidates.js';

import { COLLECTION_SCHEMAS } from '../../config/qdrantCollectionsSchema.js';
import { getSystemQdrantCollections } from '../../config/systemCollectionsConfig.js';
import { encodeBm25Document, encodeBm25Query } from '../../services/text/index.js';

const SNOWBALL = getBm25Candidate('snowball')!;

describe('BM25_CANDIDATES', () => {
  it('has unique slugs and a named source for each', () => {
    const slugs = BM25_CANDIDATES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const candidate of BM25_CANDIDATES) {
      expect(candidate.source.length).toBeGreaterThan(0);
    }
  });

  it('refuses an unknown slug instead of falling back to production', () => {
    expect(getBm25Candidate('nope')).toBeNull();
    expect(() => resolveBm25Candidate({ EVAL_BM25_CANDIDATE: 'nope' })).toThrow(/not a known/);
    expect(resolveBm25Candidate({})).toBeNull();
  });
});

describe('the candidate actually changes the index alphabet', () => {
  // Ohne diese Zusicherung könnte der ganze Lauf zweimal dieselbe Pipeline
  // messen und "kein Unterschied" melden — die überzeugendste Art, nichts
  // gemessen zu haben.
  const text = 'Die Aufstellung eines Bebauungsplans erfordert eine frühzeitige Beteiligung.';

  it('produces different sparse indices than CISTEM for the same document', () => {
    const cistem = encodeBm25Document(text);
    const snowball = encodeCandidateDocument(text, SNOWBALL);
    expect(snowball.indices.length).toBeGreaterThan(0);
    expect(new Set(snowball.indices)).not.toEqual(new Set(cistem.indices));
  });

  it('produces different sparse indices than CISTEM for the same query', () => {
    const cistem = encodeBm25Query(text);
    const snowball = encodeCandidateQuery(text, SNOWBALL);
    expect(new Set(snowball.indices)).not.toEqual(new Set(cistem.indices));
  });

  it('keeps document and query side on the same alphabet', () => {
    // Die Bedingung, an der der Vergleich hängt: was die Dokumentseite
    // hasht, muss die Anfrageseite wiederfinden.
    const doc = encodeCandidateDocument('Wärmeplanungsgesetz', SNOWBALL);
    const query = encodeCandidateQuery('Wärmeplanungsgesetz', SNOWBALL);
    expect(query.indices).toEqual(doc.indices);
  });
});

describe('collection naming', () => {
  it('round-trips through the guard', () => {
    const name = bm25CollectionName('snowball', 'kommunalwiki_documents');
    expect(name).toBe('eval_bm25_snowball__kommunalwiki_documents');
    expect(isEvalBm25Collection(name)).toBe(true);
  });

  it('rejects a slug carrying the separator', () => {
    expect(() => bm25CandidatePrefix('a__b')).toThrow(/must not contain/);
    expect(() => bm25CollectionName('snowball', '')).toThrow(/non-empty/);
  });

  it('rejects the prefix alone and a missing source', () => {
    expect(isEvalBm25Collection(EVAL_BM25_PREFIX)).toBe(false);
    expect(isEvalBm25Collection('eval_bm25_snowball__')).toBe(false);
    expect(isEvalBm25Collection('eval_bm25___kommunalwiki_documents')).toBe(false);
  });

  it('accepts no production collection name', () => {
    const production = [
      ...Object.values(COLLECTION_SCHEMAS).map((s) => s.name),
      ...getSystemQdrantCollections(),
      'documents',
      'user_knowledge',
    ];
    for (const name of production) {
      expect(isEvalBm25Collection(name)).toBe(false);
    }
    expect(guardDelete(production)).toEqual([]);
  });

  it('narrows --delete to one candidate', () => {
    const names = [
      'eval_bm25_snowball__kommunalwiki_documents',
      'eval_bm25_other__kommunalwiki_documents',
      'kommunalwiki_documents',
    ];
    expect(guardDelete(names, 'snowball')).toEqual(['eval_bm25_snowball__kommunalwiki_documents']);
    expect(guardDelete(names)).toHaveLength(2);
  });

  it('never hands a production name to the delete callback', async () => {
    const deleted: string[] = [];
    await deleteEvalCollections(
      ['kommunalwiki_documents', 'eval_bm25_snowball__kommunalwiki_documents', 'documents'],
      async (name) => void deleted.push(name)
    );
    expect(deleted).toEqual(['eval_bm25_snowball__kommunalwiki_documents']);
  });
});

describe('resolveBm25Target', () => {
  it('leaves the production collection alone without the env var', () => {
    const target = resolveBm25Target({}, 'kommunalwiki_documents');
    expect(target).toEqual({ collection: 'kommunalwiki_documents', candidate: null });
  });

  it('points at the throwaway collection with it', () => {
    const target = resolveBm25Target({ EVAL_BM25_CANDIDATE: 'snowball' }, 'kommunalwiki_documents');
    expect(target.collection).toBe('eval_bm25_snowball__kommunalwiki_documents');
    expect(target.candidate?.slug).toBe('snowball');
  });
});
