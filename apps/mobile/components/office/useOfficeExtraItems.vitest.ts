import { describe, it, expect } from 'vitest';

import { toOfficeItems } from './useOfficeExtraItems';

const board = { id: 'b1', title: 'Kampagne', updated_at: '2026-07-01T10:00:00Z' };
const canvas = { id: 'c1', title: 'Sharepic', updated_at: '2026-07-02T10:00:00Z' };

describe('toOfficeItems', () => {
  it('tags each source with its own kind', () => {
    const items = toOfficeItems([board], [canvas]);
    expect(items.map((i) => [i.id, i.kind])).toEqual([
      ['b1', 'board'],
      ['c1', 'canvas'],
    ]);
  });

  it('keeps boards ahead of canvases', () => {
    // DocumentsView sorts by date itself; this only fixes the pre-sort order so
    // two items with the same timestamp do not swap between renders.
    const items = toOfficeItems([board, { ...board, id: 'b2' }], [canvas]);
    expect(items.map((i) => i.id)).toEqual(['b1', 'b2', 'c1']);
  });

  it('drops a null thumbnail instead of passing it through', () => {
    // `thumbnailUrl: null` would reach expo-image as a source and render broken.
    const [item] = toOfficeItems([], [{ ...canvas, thumbnail_url: null }]);
    expect(item.thumbnailUrl).toBeUndefined();
    expect('thumbnailUrl' in item).toBe(true);
  });

  it('keeps a real thumbnail', () => {
    const [item] = toOfficeItems([], [{ ...canvas, thumbnail_url: 'https://x/y.png' }]);
    expect(item.thumbnailUrl).toBe('https://x/y.png');
  });

  it('never gives a board a thumbnail', () => {
    const [item] = toOfficeItems([board], []);
    expect(item.thumbnailUrl).toBeUndefined();
  });

  it('returns an empty list when both sources failed', () => {
    expect(toOfficeItems([], [])).toEqual([]);
  });
});
