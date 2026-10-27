import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { GRUENE_ASSET_CATALOG } from '../../brand/grueneAssetCatalog';
import { registerAssetCatalog } from '../canvasAssets';

import {
  findIllustrationById,
  getAllIllustrations,
  getIllustrationPath,
  getIllustrationThumbPath,
  type SvgDef,
} from './registry';

const OWN: SvgDef = {
  id: 'own-wave',
  name: 'Welle',
  filename: 'wave.svg',
  source: 'opendoodles',
  tags: ['welle'],
};

describe('illustration sources', () => {
  it('without a host knows no illustration and builds no host path', async () => {
    registerAssetCatalog({ assets: [], isInstanceSrc: () => false });
    try {
      expect(await getAllIllustrations()).toEqual([]);
      expect(await findIllustrationById('ud-3d-modeling')).toBeUndefined();
      expect(getIllustrationPath(OWN)).toBe('/opendoodles/wave.svg');
      expect(getIllustrationThumbPath(OWN, 'https://cdn.example')).toBe(
        'https://cdn.example/thumbs/opendoodles/wave.png'
      );
    } finally {
      registerAssetCatalog(GRUENE_ASSET_CATALOG);
    }
  });

  it("answer from the host's catalogue and under its base path", async () => {
    registerAssetCatalog({
      assets: [],
      isInstanceSrc: () => false,
      illustrations: {
        basePath: '/own-art',
        loadKawaii: async () => [],
        loadSvg: async () => [OWN],
      },
    });
    try {
      expect(await getAllIllustrations()).toEqual([OWN]);
      expect(getIllustrationPath(OWN, 'https://cdn.example')).toBe(
        'https://cdn.example/own-art/opendoodles/wave.svg'
      );
      expect(getIllustrationThumbPath(OWN)).toBe('/own-art/thumbs/opendoodles/wave.png');
    } finally {
      registerAssetCatalog(GRUENE_ASSET_CATALOG);
    }
  });

  // F0: saved canvases name these ids, and the files live at these paths.
  it("keep the Grünerator's ids, order and file paths byte for byte", async () => {
    const all = await getAllIllustrations();
    const lines = all.map((def) =>
      def.source === 'kawaii'
        ? `${def.id}|kawaii`
        : `${def.id}|${getIllustrationPath(def)}|${getIllustrationThumbPath(def, 'https://x')}`
    );
    expect(all).toHaveLength(GOLDEN_COUNT);
    expect(lines[0]).toBe('planet|kawaii');
    expect(lines).toContain(
      'ud-3d-modeling|/illustrations/undraw/3d-modeling_j8a3.svg|https://x/illustrations/thumbs/undraw/3d-modeling_j8a3.png'
    );
    expect(createHash('sha256').update(lines.join('\n')).digest('hex')).toBe(GOLDEN_SHA);
  });
});

const GOLDEN_COUNT = 2195;
// Measured on master before the illustration sources became host data.
const GOLDEN_SHA = '1abfd7689428c1f00c136a78cf7309b699803cdc73bb956a6714a3cc617b4eab';
