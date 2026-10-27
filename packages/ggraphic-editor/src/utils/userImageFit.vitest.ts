// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { fitToCanvas } from '@ggraphic/editor/utils/userImageUtils';

describe('fitToCanvas', () => {
  it('fits a large landscape photo into 60% of a square canvas', () => {
    expect(fitToCanvas(2160, 1440, 1080, 1080)).toEqual({ width: 648, height: 432 });
  });

  it('lets the tighter axis decide on a story canvas', () => {
    expect(fitToCanvas(1440, 2160, 1080, 1920)).toEqual({ width: 648, height: 972 });
  });

  it('keeps a small image at its own size', () => {
    expect(fitToCanvas(200, 100, 1080, 1080)).toEqual({ width: 200, height: 100 });
  });
});
