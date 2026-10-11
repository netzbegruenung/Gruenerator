import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLast = vi.hoisted(() => vi.fn());
const mockNamed = vi.hoisted(() => vi.fn());
vi.mock('./sharepicVariantHelpers.js', () => ({
  getLastSharepicVariant: mockLast,
  getSharepicVariantInWindow: mockNamed,
}));

import { resolveLoopSharepicTarget } from './sharepicLoopTarget.js';

const creator = (variantId: string) => ({
  variantId,
  canvasType: 'freeform',
  props: {
    creatorSpec: {
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
    },
    attributions: [null],
  },
  canvasId: null,
});

describe('resolveLoopSharepicTarget', () => {
  beforeEach(() => {
    mockLast.mockReset();
    mockNamed.mockReset();
  });

  it('nimmt die übergebene Id vor der offenen Karte', async () => {
    mockNamed.mockResolvedValue(creator('v2'));
    const t = await resolveLoopSharepicTarget('t1', { variantId: 'v1' }, 'v2');
    expect(mockNamed).toHaveBeenCalledWith('t1', 'v2');
    expect(t?.prior.variantId).toBe('v2');
  });

  it('nimmt die offene Karte, wenn keine Id kommt', async () => {
    mockNamed.mockResolvedValue(creator('v1'));
    await resolveLoopSharepicTarget('t1', { variantId: 'v1' });
    expect(mockNamed).toHaveBeenCalledWith('t1', 'v1');
    expect(mockLast).not.toHaveBeenCalled();
  });

  it('fällt ohne Karte auf das neueste Sharepic des Threads zurück', async () => {
    mockLast.mockResolvedValue(creator('v9'));
    const t = await resolveLoopSharepicTarget('t1', null);
    expect(t?.props.creatorSpec.slides).toHaveLength(1);
  });

  it('ist null für ein Vorlagen-Sharepic ohne Spec', async () => {
    mockLast.mockResolvedValue({
      variantId: 'v1',
      canvasType: 'dreizeilen',
      props: {},
      canvasId: null,
    });
    expect(await resolveLoopSharepicTarget('t1', null)).toBeNull();
  });
});
