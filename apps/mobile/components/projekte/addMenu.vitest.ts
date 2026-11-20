import { describe, expect, it } from 'vitest';

import { buildAddActions } from './addMenu';

describe('buildAddActions', () => {
  it('lists existing first, then new items, file and text', () => {
    expect(buildAddActions().map((a) => a.id)).toEqual([
      'existing',
      'doc',
      'sheet',
      'board',
      'file',
      'text',
    ]);
  });
  it('puts writing a post first when allowed', () => {
    expect(buildAddActions(true).map((a) => a.id)[0]).toBe('post');
    expect(buildAddActions(false).map((a) => a.id)).not.toContain('post');
  });
  it('has unique ids and German titles', () => {
    const actions = buildAddActions();
    expect(new Set(actions.map((a) => a.id)).size).toBe(actions.length);
    expect(actions.map((a) => a.title)).toContain('Datei hochladen');
  });
});
