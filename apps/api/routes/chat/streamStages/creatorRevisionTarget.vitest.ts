import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLast = vi.hoisted(() => vi.fn());
const mockHead = vi.hoisted(() => vi.fn());
vi.mock('../services/sharepicVariantHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/sharepicVariantHelpers.js')>()),
  getLastSharepicVariant: mockLast,
  getSharepicRevisionHead: mockHead,
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
  beforeEach(() => {
    mockLast.mockReset();
    mockHead.mockReset();
  });

  it('resolves a named creator card to its newest revision', async () => {
    mockHead.mockResolvedValue({
      variantId: 'v3',
      canvasType: 'freeform',
      props: { creatorSpec: SPEC, attributions: [null], revisionOf: 'v2' },
      canvasId: null,
    });
    expect(await creatorRevisionTarget('t1', 'v1')).toMatchObject({ variantId: 'v3' });
    expect(mockHead).toHaveBeenCalledWith('t1', 'v1');
    expect(mockLast).not.toHaveBeenCalled();
  });

  it('does not fall back to another sharepic when the named card is gone', async () => {
    mockHead.mockResolvedValue(null);
    mockLast.mockResolvedValue({
      variantId: 'v9',
      canvasType: 'freeform',
      props: { creatorSpec: SPEC, attributions: [null] },
      canvasId: null,
    });
    expect(await creatorRevisionTarget('t1', 'legacy-v1')).toBeNull();
  });

  it('takes the newest creator sharepic when no card is named', async () => {
    mockLast.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'freeform',
      props: { creatorSpec: SPEC, attributions: [null] },
      canvasId: null,
    });
    expect(await creatorRevisionTarget('t1', null)).toMatchObject({ variantId: 'v1' });
    expect(mockLast).toHaveBeenCalledWith('t1', null);
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
