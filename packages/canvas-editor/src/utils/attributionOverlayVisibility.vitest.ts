import { beforeAll, describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configs/configLoader';

import { isCreditedPhotoVisible } from './attributionOverlay';

/**
 * The export prints `imageAttribution` as a credit. Freeform keeps photo and
 * credit in state after a colour pick, so the credit must follow the photo's
 * visibility, not the field's presence.
 */

const PHOTO = 'https://example.org/api/share/abc/download';

describe('credit follows the photo', () => {
  let freeform: Awaited<ReturnType<typeof loadCanvasConfig>>;
  let dreizeilen: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    freeform = await loadCanvasConfig('freeform');
    dreizeilen = await loadCanvasConfig('dreizeilen');
  }, 120_000);

  const visible = (
    config: Awaited<ReturnType<typeof loadCanvasConfig>>,
    props: Record<string, unknown>
  ) =>
    isCreditedPhotoVisible(
      config.elements,
      config.createInitialState(props) as Record<string, unknown>
    );

  it('freeform prints it while the photo is shown', () => {
    expect(visible(freeform, { backgroundMode: 'image', currentImageSrc: PHOTO })).toBe(true);
  });

  it('freeform drops it once a colour replaced the photo', () => {
    expect(visible(freeform, { backgroundMode: 'color', currentImageSrc: PHOTO })).toBe(false);
  });

  it('a photo template prints it while it has a photo', () => {
    expect(visible(dreizeilen, { currentImageSrc: PHOTO })).toBe(true);
  });

  it('a template without a photo element keeps the old behaviour', () => {
    expect(isCreditedPhotoVisible([{ id: 'x', type: 'text' }], {})).toBe(true);
  });
});
