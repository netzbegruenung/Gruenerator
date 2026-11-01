import { registerHostStorageKeys } from '@ggraphic/editor/host';
import { useRecentElements } from '@ggraphic/editor/internal/sidebar/sections/assets/useRecentElements';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ElementItem } from '@ggraphic/editor/sidebar';

const ITEM = {
  key: 'shape:rect',
  label: 'Rechteck',
  keywords: [],
  action: { kind: 'shape', shape: 'rect' },
  thumb: { t: 'shape' },
} as unknown as ElementItem;

describe('recent elements storage key', () => {
  beforeEach(() => {
    localStorage.clear();
    useRecentElements.setState({ items: [] });
  });

  it('persists under the neutral default until a host registers its key', () => {
    useRecentElements.getState().remember(ITEM);
    expect(localStorage.getItem('ggraphic-recent-elements')).not.toBeNull();
    expect(localStorage.getItem('gruenerator-canvas-recent-elements')).toBeNull();
  });

  it('follows the key a host registers and reads what that key already holds', async () => {
    registerHostStorageKeys({ recentElements: 'gruenerator-canvas-recent-elements' });
    useRecentElements.getState().remember(ITEM);
    expect(localStorage.getItem('gruenerator-canvas-recent-elements')).not.toBeNull();

    useRecentElements.setState({ items: [] });
    localStorage.setItem(
      'gruenerator-canvas-recent-elements',
      JSON.stringify({ state: { items: [ITEM] }, version: 1 })
    );
    await useRecentElements.persist.rehydrate();
    expect(useRecentElements.getState().items.map((i) => i.key)).toEqual(['shape:rect']);
  });
});
