/**
 * A creator carousel arrives unminted: the deck card has no canvasId, so
 * "Im Editor öffnen" only works when the handler can mint — which needs the
 * thread the deck belongs to.
 */
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SliderDeckCard } from '../components/message-parts/SliderDeckCard';
import { axe } from '../test-utils';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';

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
  useSharepicLiveStore.setState({ entries: {}, activeVariant: null });
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

describe('carousel preview descriptions', () => {
  it('exposes slide content on the image and editor button after paging', async () => {
    useChatConfigStore.setState({
      renderSharepic: vi.fn().mockResolvedValue('data:image/png;base64,preview'),
    });
    const { container } = render(
      <SliderDeckCard
        variant={{
          ...deck,
          pages: [
            { additionalTexts: [{ text: 'Sichere Radwege' }] },
            { additionalTexts: [{ text: 'Für alle' }] },
          ],
        }}
      />
    );
    expect(
      await screen.findByRole('img', { name: 'Karussell-Folie 1 von 2: Sichere Radwege' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Karussell-Folie 1 von 2: Sichere Radwege. Im Editor öffnen',
      })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nächste Folie' }));
    expect(
      await screen.findByRole('img', { name: 'Karussell-Folie 2 von 2: Für alle' })
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('pairs alt text with each completed render and follows live editor state', async () => {
    const pages = [
      { additionalTexts: [{ text: '==Sichere Radwege==' }] },
      { additionalTexts: [{ text: 'Mehr Platz für alle' }] },
    ];
    const render = vi.fn().mockResolvedValue('data:image/png;base64,first');
    useChatConfigStore.setState({ renderSharepic: render });
    const { result } = renderHook(() => useSliderDeckArtifact({ ...deck, pages }));
    await waitFor(() =>
      expect(result.current.imageAltText).toBe('Karussell-Folie 1 von 2: Sichere Radwege')
    );

    let finish: (value: string) => void = () => {};
    render.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    act(() => result.current.selectSlide(1));
    // The previous image stays visible while rendering, so its description stays too.
    expect(result.current.imageAltText).toBe('Karussell-Folie 1 von 2: Sichere Radwege');
    await act(async () => {
      finish('data:image/png;base64,second');
    });
    expect(result.current.imageAltText).toBe('Karussell-Folie 2 von 2: Mehr Platz für alle');

    act(() =>
      useSharepicLiveStore.getState().upsertEntry(deck.id, {
        canvasId: 'canvas-1',
        canvasType: 'freeform',
        version: 2,
        state: null,
        pages: [pages[0]!, { additionalTexts: [{ text: 'Im Editor geändert' }] }],
      })
    );
    await waitFor(() =>
      expect(result.current.imageAltText).toBe('Karussell-Folie 2 von 2: Im Editor geändert')
    );
  });
});
