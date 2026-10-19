/**
 * #4732: a preview that 404s used to leave an empty tile, indistinguishable
 * from one still loading. The kind icon now stands in.
 */
import { fireEvent, render } from '@testing-library/react';
import { PiSticker } from 'react-icons/pi';
import { describe, expect, it } from 'vitest';

import { VisualImage } from './kindViews';

const visual = (src: string | null) =>
  ({ type: 'image', src, cutout: true, icon: <PiSticker /> }) as const;

describe('VisualImage', () => {
  it('shows the image while it loads', () => {
    const { container } = render(<VisualImage visual={visual('/api/thumbs/a.webp')} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/thumbs/a.webp');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('swaps a preview that fails to load for the kind icon', () => {
    const { container } = render(<VisualImage visual={visual('/api/thumbs/a.webp')} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows the kind icon when there is no src at all', () => {
    const { container } = render(<VisualImage visual={visual(null)} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('gives a new src its own chance after an earlier one failed', () => {
    const { container, rerender } = render(<VisualImage visual={visual('/a.webp')} />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(<VisualImage visual={visual('/b.webp')} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/b.webp');
  });
});
