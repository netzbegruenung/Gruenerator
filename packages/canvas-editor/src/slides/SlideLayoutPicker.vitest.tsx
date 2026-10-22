/**
 * Kacheln der Folienlayouts: erst ein Skeleton im 16:9-Format, dann das vom
 * Canvas gerenderte Bild; scheitert der Render, bleibt das Skeleton ruhig
 * stehen, die Beschriftung trägt die Kachel.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../test-utils';

import { SlideLayoutPicker } from './SlideLayoutPicker';

const renders = vi.hoisted(() => new Map<string, (url: string | null) => void>());
const render$ = vi.hoisted(() =>
  vi.fn(
    (id: string, locale: string) =>
      new Promise<string | null>((resolve) => renders.set(`${locale}:${id}`, resolve))
  )
);
vi.mock('./renderSlideLayoutThumbnail', () => ({
  preloadSlideLayoutPhoto: () => Promise.resolve(),
  renderSlideLayoutThumbnail: render$,
}));

const status = (name: string) =>
  screen.getByRole('button', { name }).querySelector('[data-thumbnail-status]');

describe('SlideLayoutPicker thumbnails', () => {
  it('shows skeletons, then the rendered image; a failed render falls back', async () => {
    const { container, unmount } = render(<SlideLayoutPicker locale="de-DE" onSelect={vi.fn()} />);
    expect(status('Titelfolie, dunkel')?.getAttribute('data-thumbnail-status')).toBe('loading');
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();

    // Eine Bühne zur Zeit: erst die Titelfolie, dann die nächste.
    await waitFor(() => expect(render$).toHaveBeenCalledTimes(1));
    renders.get('de-DE:titel')!('data:image/jpeg;base64,titel');
    await waitFor(() =>
      expect(status('Titelfolie, dunkel')?.getAttribute('data-thumbnail-status')).toBe('ready')
    );
    const img = screen.getByRole('button', { name: 'Titelfolie, dunkel' }).querySelector('img');
    expect(img?.getAttribute('src')).toBe('data:image/jpeg;base64,titel');
    expect(img?.getAttribute('alt')).toBe('');

    await waitFor(() => expect(render$).toHaveBeenCalledTimes(2));
    renders.get('de-DE:titel-bild')!(null);
    await waitFor(() =>
      expect(status('Titelfolie mit Bild, dunkel')?.getAttribute('data-thumbnail-status')).toBe(
        'failed'
      )
    );
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    // Wieder geöffnet: das fertige Bild ist sofort da, ohne neuen Render.
    render(<SlideLayoutPicker locale="de-DE" onSelect={vi.fn()} />);
    expect(status('Titelfolie, dunkel')?.getAttribute('data-thumbnail-status')).toBe('ready');
    expect(render$.mock.calls.filter(([id]) => id === 'titel')).toHaveLength(1);
  });
});
