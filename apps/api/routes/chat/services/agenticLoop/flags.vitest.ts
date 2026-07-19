import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getEditToolSurfaces } from './flags.js';

describe('getEditToolSurfaces', () => {
  const original = process.env.CHAT_EDIT_TOOL_SURFACES;

  beforeEach(() => {
    delete process.env.CHAT_EDIT_TOOL_SURFACES;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CHAT_EDIT_TOOL_SURFACES;
    else process.env.CHAT_EDIT_TOOL_SURFACES = original;
  });

  it('is empty by default (legacy trigger path stays in force)', () => {
    expect(getEditToolSurfaces().size).toBe(0);
  });

  it('parses a comma list, trimming whitespace', () => {
    process.env.CHAT_EDIT_TOOL_SURFACES = 'sheet, presentation';
    const set = getEditToolSurfaces();
    expect(set.has('sheet')).toBe(true);
    expect(set.has('presentation')).toBe(true);
    expect(set.has('board')).toBe(false);
  });

  it('expands "all" to every surface', () => {
    process.env.CHAT_EDIT_TOOL_SURFACES = 'all';
    expect(getEditToolSurfaces().size).toBe(5);
  });

  it('ignores unknown tokens', () => {
    process.env.CHAT_EDIT_TOOL_SURFACES = 'sheet,bogus,board';
    const set = getEditToolSurfaces();
    expect([...set].sort()).toEqual(['board', 'sheet']);
  });
});
