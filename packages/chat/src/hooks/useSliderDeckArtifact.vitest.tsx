/**
 * A creator carousel arrives unminted: the deck card has no canvasId, so
 * "Im Editor öffnen" only works when the handler can mint — which needs the
 * thread the deck belongs to.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

import { useSliderDeckArtifact } from './useSliderDeckArtifact';

import type { SharepicVariant } from './useChatGraphStream';

const props = { creatorSpec: { locale: 'de-DE', slides: [] }, attributions: [null, null] };
const deck = {
  id: 'deck-1',
  canvasType: 'freeform',
  initialProps: props,
  pages: [
    { ...props, slide: 0 },
    { ...props, slide: 1 },
  ],
} as unknown as SharepicVariant;

afterEach(() => {
  useChatConfigStore.setState({ onEditSharepic: undefined, renderSharepic: undefined });
  useAgentStore.setState({ currentThreadId: null });
});

describe('useSliderDeckArtifact.openInStudio', () => {
  it('hands the current thread to the editor handler so an unminted deck can mint', () => {
    const onEditSharepic = vi.fn();
    useChatConfigStore.setState({ onEditSharepic });
    useAgentStore.setState({ currentThreadId: 'thread-7' });

    const { result } = renderHook(() => useSliderDeckArtifact(deck));
    result.current.openInStudio();

    expect(onEditSharepic).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'deck-1', initialProps: props }),
      { threadId: 'thread-7' }
    );
    expect(onEditSharepic.mock.calls[0]?.[0]).not.toHaveProperty('canvasId');
  });
});
