import { describe, expect, it } from 'vitest';

import {
  EMBED_CANDIDATES,
  EVAL_EMBED_PREFIX,
  evalCollectionName,
  getEmbedCandidate,
  isEvalEmbedCollection,
  resolveEvalCandidate,
  resolveEvalTarget,
} from './embedCandidates.js';

import { COLLECTION_SCHEMAS } from '../../config/qdrantCollectionsSchema.js';
import { getSystemQdrantCollections } from '../../config/systemCollectionsConfig.js';

describe('EMBED_CANDIDATES', () => {
  it('has unique slugs, even ignoring case', () => {
    const slugs = EMBED_CANDIDATES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const lowered = slugs.map((s) => s.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it('declares a positive dimension and context window for every candidate', () => {
    for (const candidate of EMBED_CANDIDATES) {
      expect(candidate.dims).toBeGreaterThan(0);
      expect(candidate.maxTokens).toBeGreaterThan(0);
    }
  });

  it('carries the query instruction only where the model card asks for one', () => {
    const withInstruction = EMBED_CANDIDATES.filter((c) => c.queryInstruction !== null);
    expect(withInstruction.map((c) => c.slug)).toEqual(['qwen3-8b-greenpt', 'qwen3-8b-regolo']);
    // Beide Hosts fahren dieselben Gewichte — eine abweichende Anleitung würde
    // den Hostvergleich in einen Modellvergleich verwandeln.
    expect(withInstruction[0].queryInstruction).toBe(withInstruction[1].queryInstruction);
  });

  it('resolves known slugs and refuses unknown ones', () => {
    expect(getEmbedCandidate('bge-m3')?.dims).toBe(1024);
    expect(getEmbedCandidate('mistral-embed')).toBeNull();
  });
});

describe('evalCollectionName', () => {
  it('always carries the prefix and both parts', () => {
    for (const candidate of EMBED_CANDIDATES) {
      for (const source of ['grundsatz_documents', 'kommunalwiki_documents']) {
        const name = evalCollectionName(candidate.slug, source);
        expect(name.startsWith(EVAL_EMBED_PREFIX)).toBe(true);
        expect(name.endsWith(source)).toBe(true);
        expect(isEvalEmbedCollection(name)).toBe(true);
      }
    }
  });

  it('produces a distinct name per candidate and per source collection', () => {
    const names = EMBED_CANDIDATES.flatMap((c) =>
      ['grundsatz_documents', 'gruene_de_documents'].map((s) => evalCollectionName(c.slug, s))
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('refuses empty parts and a slug that would break the separator', () => {
    expect(() => evalCollectionName('', 'documents')).toThrow();
    expect(() => evalCollectionName('bge-m3', '')).toThrow();
    expect(() => evalCollectionName('bge__m3', 'documents')).toThrow();
  });
});

describe('isEvalEmbedCollection', () => {
  it('rejects every production collection name we ship', () => {
    const production = new Set([
      ...Object.values(COLLECTION_SCHEMAS).map((s) => s.name),
      ...getSystemQdrantCollections(),
      'documents',
      'user_knowledge',
    ]);
    expect(production.size).toBeGreaterThan(5);
    for (const name of production) {
      expect(isEvalEmbedCollection(name)).toBe(false);
    }
  });

  it('rejects near misses', () => {
    expect(isEvalEmbedCollection('eval_embed_')).toBe(false);
    expect(isEvalEmbedCollection('eval_embed___documents')).toBe(false);
    expect(isEvalEmbedCollection('eval_embed_bge-m3')).toBe(false);
    expect(isEvalEmbedCollection('eval_embed_bge-m3__')).toBe(false);
    expect(isEvalEmbedCollection('xeval_embed_bge-m3__documents')).toBe(false);
    expect(isEvalEmbedCollection('grundsatz_documents__eval_embed_bge-m3')).toBe(false);
    expect(isEvalEmbedCollection('')).toBe(false);
  });
});

describe('resolveEvalCandidate', () => {
  it('is null when the variable is unset or empty', () => {
    expect(resolveEvalCandidate({})).toBeNull();
    expect(resolveEvalCandidate({ EVAL_EMBED_CANDIDATE: '' })).toBeNull();
  });

  it('returns the candidate for a known slug', () => {
    expect(resolveEvalCandidate({ EVAL_EMBED_CANDIDATE: 'bge-m3' })?.provider).toBe('cortecs');
  });

  it('throws on an unknown slug', () => {
    expect(() => resolveEvalCandidate({ EVAL_EMBED_CANDIDATE: 'jina-v3' })).toThrow(
      /not a known candidate/
    );
  });
});

describe('resolveEvalTarget', () => {
  it('points at the production collection when the variable is unset', () => {
    const target = resolveEvalTarget({}, 'grundsatz_documents');
    expect(target.collection).toBe('grundsatz_documents');
    expect(target.candidate).toBeNull();
  });

  it('treats an empty variable as unset', () => {
    expect(resolveEvalTarget({ EVAL_EMBED_CANDIDATE: '' }, 'documents').candidate).toBeNull();
  });

  it('points at the candidate collection and carries the candidate', () => {
    const target = resolveEvalTarget(
      { EVAL_EMBED_CANDIDATE: 'qwen3-8b-regolo' },
      'grundsatz_documents'
    );
    expect(target.collection).toBe('eval_embed_qwen3-8b-regolo__grundsatz_documents');
    expect(target.candidate?.model).toBe('Qwen3-Embedding-8B');
  });

  it('throws on an unknown slug instead of silently measuring production', () => {
    expect(() => resolveEvalTarget({ EVAL_EMBED_CANDIDATE: 'bgem3' }, 'documents')).toThrow(
      /not a known candidate/
    );
  });
});
