import { registerAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';
import { findIllustrationById } from '@ggraphic/editor/utils/illustrations/registry';
import { clearCache, getSVG } from '@ggraphic/editor/utils/illustrations/svgCache';
import { type SvgDef } from '@ggraphic/editor/utils/illustrations/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GRUENE_ASSET_CATALOG } from './grueneAssetCatalog';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#6C63FF"/><path fill="#ff5678"/></svg>';

const decode = (dataUrl: string) =>
  decodeURIComponent(escape(atob(dataUrl.replace('data:image/svg+xml;base64,', ''))));

beforeEach(() => {
  clearCache();
  registerAssetCatalog(GRUENE_ASSET_CATALOG);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(SVG)))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the Grünerator's unDraw set on ggraphic", () => {
  it('resolves by id from the catalogue', async () => {
    const def = await findIllustrationById('ud-3d-modeling');
    expect(def).toMatchObject({ id: 'ud-3d-modeling', source: 'undraw' });
  });

  it('is tinted by swapping its primary colour #6c63ff', async () => {
    const def = await findIllustrationById('ud-3d-modeling');
    const svg = decode(await getSVG('ud-3d-modeling', def as SvgDef, '#123456'));
    expect(svg).toContain('fill="#123456"');
    expect(svg).not.toMatch(/#6c63ff/i);
    expect(svg).toContain('#ff5678');
  });
});
