import { describe, expect, it } from 'vitest';

import { type OfficeItem } from '../office/officeItem';

import { groupOfficeItems, toRecentItem } from './officeSections';

const item = (over: Partial<OfficeItem> & Pick<OfficeItem, 'id' | 'kind'>): OfficeItem => ({
  title: `Titel ${over.id}`,
  updatedAt: '2026-09-30T10:00:00Z',
  ...over,
});

describe('groupOfficeItems', () => {
  it('sorts each kind into its section and keeps the incoming order', () => {
    const groups = groupOfficeItems([
      item({ id: 'd1', kind: 'doc' }),
      item({ id: 's1', kind: 'sheet' }),
      item({ id: 'd2', kind: 'doc' }),
      item({ id: 'b1', kind: 'board' }),
      item({ id: 'p1', kind: 'presentation' }),
    ]);
    expect(groups.doc.map((i) => i.id)).toEqual(['d1', 'd2']);
    expect(groups.sheet.map((i) => i.id)).toEqual(['s1']);
    expect(groups.presentation.map((i) => i.id)).toEqual(['p1']);
    expect(groups.board.map((i) => i.id)).toEqual(['b1']);
  });

  // Canvases are already under Sharepics (useStudioMedia); a second listing
  // would show one canvas twice on the same page.
  it('leaves canvases out', () => {
    const groups = groupOfficeItems([item({ id: 'c1', kind: 'canvas' })]);
    expect(Object.values(groups).flat()).toEqual([]);
  });
});

describe('toRecentItem', () => {
  it('draws a sheet with the document card and keeps its preview', () => {
    expect(toRecentItem(item({ id: 's1', kind: 'sheet', preview: '<p>A</p>' }))).toMatchObject({
      id: 's1',
      type: 'doc',
      content: '<p>A</p>',
      date: '2026-09-30T10:00:00Z',
    });
  });

  it('omits fields the item does not have', () => {
    const recent = toRecentItem(item({ id: 'b1', kind: 'board' }));
    expect(recent.type).toBe('board');
    expect('content' in recent).toBe(false);
    expect('thumbnailUrl' in recent).toBe(false);
  });
});
