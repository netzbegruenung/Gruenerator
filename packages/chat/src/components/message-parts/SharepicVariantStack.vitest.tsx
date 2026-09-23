import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SharepicVariantStack } from './SharepicVariantStack';

import type { SharepicData, SharepicVariant } from '../../hooks/useChatGraphStream';

const thumbRenders = new Map<string, number>();

vi.mock('../../hooks/useSharepicThumbnail', () => ({
  useSharepicThumbnail: (variant: SharepicVariant) => {
    thumbRenders.set(variant.id, (thumbRenders.get(variant.id) ?? 0) + 1);
    return { imageBase64: null, failed: false };
  },
}));

vi.mock('./SharepicVariantCard', () => ({
  SharepicVariantCard: ({ variant }: { variant: SharepicVariant }) => (
    <div data-testid="hero">{variant.id}</div>
  ),
}));

const variant = (id: string) => ({ id, type: 'dreizeilen' }) as unknown as SharepicVariant;

describe('SharepicVariantStack', () => {
  beforeEach(() => thumbRenders.clear());

  it('re-renders only the thumbs whose selection changed', () => {
    const data = { variants: [variant('a'), variant('b'), variant('c')] } as SharepicData;
    render(<SharepicVariantStack data={data} />);
    expect(screen.getByTestId('hero')).toHaveTextContent('a');
    thumbRenders.clear();

    fireEvent.click(screen.getAllByRole('button', { pressed: false })[0]!);

    expect(screen.getByTestId('hero')).toHaveTextContent('b');
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.has('c')).toBe(false);
  });
});
