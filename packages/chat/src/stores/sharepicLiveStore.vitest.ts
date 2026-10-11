import { beforeEach, describe, expect, it } from 'vitest';

import { useSharepicLiveStore } from './sharepicLiveStore';

const ORIGINAL = {
  variantId: 'v1',
  canvasId: null,
  canvasType: 'freeform' as const,
  initialProps: { creatorSpec: { slides: [] } },
  label: 'Sharepic',
};

describe('sharepicLiveStore.followRevision', () => {
  beforeEach(() => {
    useSharepicLiveStore.setState({ entries: {}, activeVariant: null });
  });

  it('zieht den Sharepic-Modus auf die Revision der offenen Karte nach', () => {
    useSharepicLiveStore.getState().setActiveVariant(ORIGINAL);
    useSharepicLiveStore.getState().followRevision([
      {
        id: 'v2',
        canvasType: 'freeform',
        initialProps: { creatorSpec: { slides: [] }, revisionOf: 'v1' },
        label: 'Überarbeitet',
        pages: [{ a: 1 }],
      },
    ]);
    expect(useSharepicLiveStore.getState().activeVariant).toEqual({
      variantId: 'v2',
      canvasId: null,
      canvasType: 'freeform',
      initialProps: { creatorSpec: { slides: [] }, revisionOf: 'v1' },
      label: 'Überarbeitet',
      pages: [{ a: 1 }],
    });
  });

  it('lässt den Modus bei einem fremden oder neuen Sharepic stehen', () => {
    useSharepicLiveStore.getState().setActiveVariant(ORIGINAL);
    useSharepicLiveStore.getState().followRevision([
      { id: 'v9', canvasType: 'freeform', initialProps: { revisionOf: 'other' } },
      { id: 'v8', canvasType: 'freeform', initialProps: {} },
    ]);
    expect(useSharepicLiveStore.getState().activeVariant?.variantId).toBe('v1');
  });

  it('tut ohne offenen Modus nichts', () => {
    useSharepicLiveStore
      .getState()
      .followRevision([{ id: 'v2', canvasType: 'freeform', initialProps: { revisionOf: 'v1' } }]);
    expect(useSharepicLiveStore.getState().activeVariant).toBeNull();
  });
});
