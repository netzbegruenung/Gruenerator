import { describe, expect, it } from 'vitest';

import { decideWolkeUrlMigration } from './wolkeUrlMigration.js';

describe('decideWolkeUrlMigration', () => {
  it('migrates when only the legacy url is stored', () => {
    expect(decideWolkeUrlMigration({ newExists: false, legacyExists: true })).toBe('migrate');
  });

  it('does nothing when only the new url is stored', () => {
    expect(decideWolkeUrlMigration({ newExists: true, legacyExists: false })).toBe('none');
  });

  it('does nothing for a file stored under neither url', () => {
    expect(decideWolkeUrlMigration({ newExists: false, legacyExists: false })).toBe('none');
  });

  it('reports a duplicate instead of merging two chunk sets under one url', () => {
    expect(decideWolkeUrlMigration({ newExists: true, legacyExists: true })).toBe('duplicate');
  });
});
