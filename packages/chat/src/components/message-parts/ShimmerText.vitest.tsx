import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShimmerText } from './ShimmerText';

describe('ShimmerText', () => {
  it('renders its children and the shimmer-text class', () => {
    render(<ShimmerText>Lädt...</ShimmerText>);
    const el = screen.getByText('Lädt...');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('shimmer-text');
  });

  it('merges a custom className alongside the base class', () => {
    render(<ShimmerText className="text-sm">Suche läuft</ShimmerText>);
    const el = screen.getByText('Suche läuft');
    expect(el.className).toContain('shimmer-text');
    expect(el.className).toContain('text-sm');
  });
});
