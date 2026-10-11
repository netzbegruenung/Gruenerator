import { describe, expect, it } from 'vitest';

import { loadPersistedVersions } from './persistedVersions';

const v = (id: string, image = `file:///${id}.png`) => ({
  id,
  parentId: null,
  prompt: id,
  image,
  width: 1,
  height: 1,
  time: 0,
  num: 1,
  kind: 'create' as const,
});

const raw = (value: unknown) => JSON.stringify(value);
const all = () => true;

describe('loadPersistedVersions', () => {
  it('returns null without stored data', () => {
    expect(loadPersistedVersions(null, all)).toBeNull();
    expect(loadPersistedVersions('', all)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    expect(loadPersistedVersions('{nope', all)).toBeNull();
  });

  it('drops versions whose cache file is gone, and treats a throwing check as gone', () => {
    const result = loadPersistedVersions(
      raw({ versions: [v('a'), v('b'), v('c')], activeId: 'a' }),
      (uri) => {
        if (uri.endsWith('c.png')) throw new Error('io');
        return uri.endsWith('a.png');
      }
    );
    expect(result?.versions.map((x) => x.id)).toEqual(['a']);
  });

  it('keeps the active id while its version is alive', () => {
    const result = loadPersistedVersions(raw({ versions: [v('a'), v('b')], activeId: 'a' }), all);
    expect(result?.activeId).toBe('a');
  });

  it('falls back to the last alive version when the active one is gone', () => {
    const result = loadPersistedVersions(
      raw({ versions: [v('a'), v('b'), v('c')], activeId: 'c' }),
      (uri) => !uri.endsWith('c.png')
    );
    expect(result?.activeId).toBe('b');
  });

  it('has no active id when nothing is alive', () => {
    const result = loadPersistedVersions(raw({ versions: [v('a')], activeId: 'a' }), () => false);
    expect(result).toEqual({ versions: [], activeId: null, settings: undefined });
  });

  it('passes the stored settings through', () => {
    const result = loadPersistedVersions(
      raw({ versions: [v('a')], activeId: 'a', settings: { aspect: '9:16' } }),
      all
    );
    expect(result?.settings).toEqual({ aspect: '9:16' });
  });
});
