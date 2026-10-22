import { replaceCanvasPagesBodySchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getCanvasFormatOrDefault } from '../formats';
import { createFreeformAtFullConfig } from './freeform_at_full.config';
import { createFreeformFullConfig } from './freeform_full.config';

describe('page cap per format', () => {
  it('lets a presentation grow to 60 pages, other formats stay at 10', () => {
    expect(
      createFreeformFullConfig(getCanvasFormatOrDefault('slide-16-9')).multiPage?.maxPages
    ).toBe(60);
    expect(
      createFreeformAtFullConfig(getCanvasFormatOrDefault('slide-16-9')).multiPage?.maxPages
    ).toBe(60);
    expect(
      createFreeformFullConfig(getCanvasFormatOrDefault('post-portrait')).multiPage?.maxPages
    ).toBe(10);
  });

  it('accepts 60 pages in the replace-pages contract', () => {
    const pages = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      configId: 'freeform',
      state: {},
    }));
    expect(replaceCanvasPagesBodySchema.safeParse({ pages, format: 'slide-16-9' }).success).toBe(
      true
    );
  });
});
