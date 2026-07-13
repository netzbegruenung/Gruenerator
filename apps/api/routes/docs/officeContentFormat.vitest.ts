import { describe, expect, it } from 'vitest';

import { officeKind, officeSnippet, officeUrl } from './officeContentFormat.js';

describe('officeKind', () => {
  it('maps subtypes to composer kinds', () => {
    expect(officeKind('boards')).toBe('board');
    expect(officeKind('sheets')).toBe('sheet');
    expect(officeKind('presentations')).toBe('pres');
  });

  it('falls back to doc for everything else (incl. null)', () => {
    expect(officeKind('antrag')).toBe('doc');
    expect(officeKind('tabelle')).toBe('doc');
    expect(officeKind(null)).toBe('doc');
  });
});

describe('officeUrl', () => {
  it('routes boards to /boards and the rest to /office', () => {
    expect(officeUrl('boards', 'abc')).toBe('/boards/abc');
    expect(officeUrl('sheets', 'abc')).toBe('/office/abc');
    expect(officeUrl(null, 'abc')).toBe('/office/abc');
  });
});

describe('officeSnippet', () => {
  it('strips HTML from doc/sheet/presentation previews', () => {
    expect(officeSnippet('docs', '<p>Hallo <strong>Welt</strong></p>')).toBe('Hallo Welt');
  });

  it('extracts columns and notes from board JSON previews', () => {
    const content = JSON.stringify({
      board_type: 'kanban',
      preview: { columns: [{ name: 'Todo' }, { name: 'Done' }], notes: ['Klimaplan'] },
    });
    expect(officeSnippet('boards', content)).toBe('Todo, Done, Klimaplan');
  });

  it('returns empty string for malformed board JSON', () => {
    expect(officeSnippet('boards', 'not json')).toBe('');
  });

  it('returns empty string when content is null', () => {
    expect(officeSnippet('docs', null)).toBe('');
  });
});
