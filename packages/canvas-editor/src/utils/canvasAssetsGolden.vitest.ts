import { describe, expect, it } from 'vitest';

import {
  ALL_ASSETS,
  CANVAS_RECOMMENDED_ASSETS,
  LOGO_ASSETS,
  SYSTEM_ASSETS,
  TEMPLATE_ASSETS,
} from '../brand/grueneAssets';

/**
 * The asset catalogue as the editor sees it, pinned as JSON: the picker's
 * order, every system asset's file and label, and what each template
 * recommends. Splitting the catalogue into a neutral part and a brand part
 * must leave this file unchanged.
 */
describe('asset catalogue golden', () => {
  it('keeps every entry, in order', async () => {
    const catalogue = {
      SYSTEM_ASSETS,
      ALL_ASSETS,
      TEMPLATE_ASSETS,
      LOGO_ASSETS: LOGO_ASSETS.map((a) => a.id),
      CANVAS_RECOMMENDED_ASSETS,
    };
    await expect(`${JSON.stringify(catalogue, null, 1)}\n`).toMatchFileSnapshot(
      '__golden__/assetCatalogue.json'
    );
  });
});
