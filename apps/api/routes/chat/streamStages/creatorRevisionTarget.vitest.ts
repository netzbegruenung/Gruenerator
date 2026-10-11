import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLast = vi.hoisted(() => vi.fn());
const mockNamed = vi.hoisted(() => vi.fn());
vi.mock('../services/sharepicVariantHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<typeof VariantHelpers>()),
  getLastSharepicVariant: mockLast,
  getSharepicVariantInWindow: mockNamed,
}));

import { buildSharepicContextBlock, creatorRevisionTarget } from './earlyHandlerStage.js';

import type * as VariantHelpers from '../services/sharepicVariantHelpers.js';
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
    mockNamed.mockReset();
  });

  it('revises the named creator card itself, even when newer revisions exist', async () => {
    mockNamed.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'freeform',
      props: { creatorSpec: SPEC, attributions: [null] },
      canvasId: null,
    });
    expect(await creatorRevisionTarget('t1', 'v1')).toMatchObject({ variantId: 'v1' });
    expect(mockNamed).toHaveBeenCalledWith('t1', 'v1');
    expect(mockLast).not.toHaveBeenCalled();
  });

  it('does not fall back to another sharepic when the named card is gone', async () => {
    mockNamed.mockResolvedValue(null);
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

describe('buildSharepicContextBlock', () => {
  beforeEach(() => {
    mockNamed.mockReset();
  });

  it('gibt dem Antwortpfad die Spec der offenen Karte und sagt, dass nichts geändert wurde', async () => {
    mockNamed.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'freeform',
      props: { creatorSpec: SPEC, attributions: [null] },
      canvasId: null,
    });
    const block = await buildSharepicContextBlock('t1', 'v1');
    expect(block).toContain('Busse statt Stau');
    expect(block).toContain('"color":"tanne"');
    expect(block).toContain('nichts geändert');
    expect(mockNamed).toHaveBeenCalledWith('t1', 'v1');
  });

  it('ist null für ein Vorlagen-Sharepic ohne Creator-Spec', async () => {
    mockNamed.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'dreizeilen',
      props: { line1: 'a' },
      canvasId: null,
    });
    expect(await buildSharepicContextBlock('t1', 'v1')).toBeNull();
  });
});
