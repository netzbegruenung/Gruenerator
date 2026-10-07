import { describe, expect, it } from 'vitest';

import { type OfficeItem } from '../office/officeItem';

import {
  filterByTitle,
  fromOfficeSearchItem,
  groupOfficeItems,
  toRecentItem,
} from './officeSections';

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
  it('marks a sheet the way /recent-activity does, so it gets the table card', () => {
    expect(
      toRecentItem(item({ id: 's1', kind: 'sheet', preview: '<table></table>' }))
    ).toMatchObject({
      id: 's1',
      type: 'doc',
      documentType: 'sheets',
      content: '<table></table>',
      date: '2026-09-30T10:00:00Z',
    });
  });

  it('carries a board preview through', () => {
    const preview = { columns: [{ name: 'Offen', count: 2 }] };
    expect(
      toRecentItem(item({ id: 'b1', kind: 'board', boardType: 'kanban', boardPreview: preview }))
    ).toMatchObject({ type: 'board', boardType: 'kanban', preview });
  });

  it('omits fields the item does not have', () => {
    const recent = toRecentItem(item({ id: 'b1', kind: 'board' }));
    expect(recent.type).toBe('board');
    expect('content' in recent).toBe(false);
    expect('thumbnailUrl' in recent).toBe(false);
    expect('documentType' in recent).toBe(false);
    expect('preview' in recent).toBe(false);
  });
});

describe('fromOfficeSearchItem', () => {
  const hit = {
    id: 'h1',
    kind: 'pres' as const,
    title: 'Klausur',
    snippet: 'Folie 3: Radwege',
    url: '/office/h1',
    updatedAt: '2026-09-30T10:00:00Z',
  };

  // The endpoint says `pres`, the office model `presentation` — a missed
  // mapping would open the hit in the doc editor.
  it('maps the search kind onto the office kind', () => {
    expect(fromOfficeSearchItem(hit)).toMatchObject({
      kind: 'presentation',
      preview: 'Folie 3: Radwege',
    });
    expect(fromOfficeSearchItem({ ...hit, kind: 'board' }).kind).toBe('board');
  });

  it('drops an empty snippet instead of claiming an empty preview', () => {
    expect('preview' in fromOfficeSearchItem({ ...hit, snippet: '' })).toBe(false);
  });
});

describe('filterByTitle', () => {
  const items = [{ title: 'Sonnenblumenfeld' }, { title: 'Lastenrad in der Innenstadt' }];

  it('matches case-insensitively and ignores surrounding blanks', () => {
    expect(filterByTitle(items, '  LASTEN ')).toEqual([items[1]]);
  });

  it('keeps everything for an empty query', () => {
    expect(filterByTitle(items, ' ')).toEqual(items);
  });
});
