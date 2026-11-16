import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KreisMap, kreisFill } from './KreisMap';

const geo = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { AGS: '05911', GEN: 'Bochum' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [7, 51],
            [7.2, 51],
            [7.2, 51.2],
            [7, 51],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { AGS: '05113', GEN: 'Essen' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [6.9, 51.3],
            [7.1, 51.3],
            [7.1, 51.5],
            [6.9, 51.3],
          ],
        ],
      },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('KreisMap', () => {
  it('0 and 1 speeches get different fills', () => {
    expect(kreisFill(0, 5)).not.toBe(kreisFill(1, 5));
    expect(kreisFill(0, 5)).toBe('url(#pt-zero)');
    expect(kreisFill(5, 5)).not.toBe(kreisFill(1, 5));
  });

  it('renders labelled districts, toggles on click and keeps focus apart from selection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve(geo) }))
    );
    const onSelect = vi.fn();
    render(<KreisMap counts={{ '05911': 1 }} selected={null} onSelect={onSelect} />);
    const bochum = await screen.findByRole('button', { name: 'Bochum: 1 Rede' });
    expect(screen.getByRole('button', { name: 'Essen: 0 Reden' })).toHaveAttribute(
      'fill',
      'url(#pt-zero)'
    );
    expect(bochum).not.toHaveAttribute('fill', 'url(#pt-zero)');
    await userEvent.click(bochum);
    expect(onSelect).toHaveBeenCalledWith('05911');
    expect(screen.getByText(/BKG \(2026\)/)).toBeInTheDocument();
  });

  it('selected state is a separate overlay from the focus indicator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ json: () => Promise.resolve(geo) }))
    );
    render(<KreisMap counts={{ '05911': 1 }} selected="05911" onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: 'Bochum: 1 Rede' });
    expect(screen.getByTestId('kreis-selected')).toBeInTheDocument();
    expect(screen.queryByTestId('kreis-focus')).not.toBeInTheDocument();
  });
});
