import { describe, expect, it } from 'vitest';

import { isWolkeRoot, joinWolkePath, wolkeParentPath } from './wolkePath';

describe('joinWolkePath', () => {
  it('joins inside a folder', () => {
    expect(joinWolkePath('/Wahlkampf', 'plan.md')).toBe('/Wahlkampf/plan.md');
  });

  it('treats an empty parent and "/" alike as the root', () => {
    expect(joinWolkePath('', 'plan.md')).toBe('/plan.md');
    expect(joinWolkePath('/', 'plan.md')).toBe('/plan.md');
  });

  it('does not double the separator when the parent has a trailing slash', () => {
    expect(joinWolkePath('/Wahlkampf/', 'plan.md')).toBe('/Wahlkampf/plan.md');
  });
});

describe('wolkeParentPath', () => {
  it('climbs one level', () => {
    expect(wolkeParentPath('/Wahlkampf/2026/plan.md')).toBe('/Wahlkampf/2026');
  });

  // The browse endpoint wants '' for the top level, not '/'. Returning '/' here
  // would ask for a folder named nothing and strand the user one level down.
  it('returns the empty root from a first-level entry', () => {
    expect(wolkeParentPath('/plan.md')).toBe('');
  });

  it('is already empty at the root', () => {
    expect(wolkeParentPath('')).toBe('');
    expect(wolkeParentPath('/')).toBe('');
  });

  it('ignores a trailing slash on a folder path', () => {
    expect(wolkeParentPath('/Wahlkampf/2026/')).toBe('/Wahlkampf');
  });
});

describe('isWolkeRoot', () => {
  it('recognises both spellings of the root', () => {
    expect(isWolkeRoot('')).toBe(true);
    expect(isWolkeRoot('/')).toBe(true);
  });

  it('is false anywhere else', () => {
    expect(isWolkeRoot('/Wahlkampf')).toBe(false);
  });
});
