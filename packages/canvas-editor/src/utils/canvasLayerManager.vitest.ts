import { describe, expect, it } from 'vitest';

import { buildSortedRenderList, type CanvasItem } from './canvasLayerManager';

import type { CanvasElementConfig } from '../configs/types';

function element(id: string, order?: number): CanvasItem {
  return {
    id,
    type: 'element',
    data: { id, type: 'rect', x: 0, y: 0, width: 1, height: 1, order } as CanvasElementConfig,
  };
}

function shape(id: string): CanvasItem {
  return { id, type: 'shape', data: { id } as never };
}

describe('buildSortedRenderList', () => {
  it('follows a saved layerOrder for the items it names', () => {
    const items = [element('a', 1), element('b', 2), element('c', 3)];
    const sorted = buildSortedRenderList(items, ['c', 'a', 'b']);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('appends an untracked shape on top', () => {
    const items = [element('a', 1), element('b', 2), shape('new-shape')];
    const sorted = buildSortedRenderList(items, ['a', 'b']);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'new-shape']);
  });

  /**
   * The reason this function was touched. `zitat` and `dreizeilen` gained a
   * `background-color` plane; a document saved BEFORE that has a layerOrder
   * that cannot name it. Appending it — the old behaviour — draws a full-bleed
   * rect last, i.e. over the finished sharepic, and the document opens as a
   * solid green square. A negative `order` is how a config says "behind
   * everything", and that has to survive an out-of-date layerOrder.
   */
  it('sends an untracked background plane behind a stale layerOrder', () => {
    const items = [
      element('background-color', -1),
      element('quote-text', 3),
      element('name-text', 4),
    ];
    const sorted = buildSortedRenderList(items, ['name-text', 'quote-text']);
    expect(sorted.map((i) => i.id)).toEqual(['background-color', 'name-text', 'quote-text']);
  });

  it('keeps several untracked planes in their declared order', () => {
    const items = [
      element('gradient-overlay', -0.5),
      element('background', -2),
      element('background-image', -1),
      element('headline', 1),
    ];
    const sorted = buildSortedRenderList(items, ['headline']);
    expect(sorted.map((i) => i.id)).toEqual([
      'background',
      'background-image',
      'gradient-overlay',
      'headline',
    ]);
  });

  it('leaves a plane the layerOrder does name exactly where it was put', () => {
    // Someone deliberately moved the photo above a shape. That is a user
    // decision, not stale data, and the front-loading must not undo it.
    const items = [element('background-image', -1), shape('deco')];
    const sorted = buildSortedRenderList(items, ['deco', 'background-image']);
    expect(sorted.map((i) => i.id)).toEqual(['deco', 'background-image']);
  });
});
