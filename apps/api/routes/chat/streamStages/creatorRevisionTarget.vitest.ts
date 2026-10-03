import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLast = vi.hoisted(() => vi.fn());
vi.mock('../services/sharepicVariantHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/sharepicVariantHelpers.js')>()),
  getLastSharepicVariant: mockLast,
}));

import { creatorRevisionTarget } from './earlyHandlerStage.js';

import type { SharepicSpec } from '@gruenerator/contracts';

const SPEC: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Busse statt Stau'] }],
      logo: false,
    },
  ],
};

describe('creatorRevisionTarget', () => {
  beforeEach(() => mockLast.mockReset());

  it('returns the prior for a creator sharepic', async () => {
    mockLast.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'freeform',
      props: { creatorSpec: SPEC, attributions: [null] },
      canvasId: null,
    });
    expect(await creatorRevisionTarget('t1', 'v1')).toMatchObject({ variantId: 'v1' });
    expect(mockLast).toHaveBeenCalledWith('t1', 'v1');
  });

  it('returns null for a legacy template sharepic', async () => {
    mockLast.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'dreizeilen',
      props: { line1: 'a' },
      canvasId: null,
    });
    expect(await creatorRevisionTarget('t1', null)).toBeNull();
  });

  it('returns null when the thread has no sharepic', async () => {
    mockLast.mockResolvedValue(null);
    expect(await creatorRevisionTarget('t1', null)).toBeNull();
  });
});
