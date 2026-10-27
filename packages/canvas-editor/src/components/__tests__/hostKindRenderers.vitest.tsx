import {
  registerKindRenderers,
  renderKindItem,
  type RenderCtx,
} from '@ggraphic/editor/components/kindRenderers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GRUENE_KIND_RENDERERS } from '../../brand/grueneKinds';

import type { KindItem } from '@ggraphic/editor/utils/elementKinds';

const balken: KindItem = {
  id: 'balken-1',
  type: 'balken',
  data: {
    id: 'balken-1',
    mode: 'single',
    colorSchemeId: 'tanne-sand',
    widthScale: 1,
    offset: { x: 0, y: 0 },
    scale: 1,
    texts: ['Text'],
    rotation: 0,
  },
};

// The stub renderers below never read the context.
const ctx = {} as RenderCtx;

describe('kinds the host draws', () => {
  afterEach(() => registerKindRenderers(GRUENE_KIND_RENDERERS));

  it('draws a host kind through the renderer the host registered', () => {
    const render = vi.fn(() => 'drawn');
    registerKindRenderers({ balken: render });

    expect(renderKindItem(balken, ctx)).toBe('drawn');
    expect(render).toHaveBeenCalledWith(balken, ctx);
  });

  it('draws nothing for a host kind without a registered renderer', () => {
    registerKindRenderers({});

    expect(renderKindItem(balken, ctx)).toBeNull();
  });

  it('gets the Balken renderer from the Grünerator', () => {
    expect(GRUENE_KIND_RENDERERS.balken).toBeTypeOf('function');
  });
});
