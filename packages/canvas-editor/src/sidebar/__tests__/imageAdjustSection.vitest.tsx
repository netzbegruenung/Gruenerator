import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImageAdjustSection } from '@ggraphic/editor/sidebar/sections/ImageAdjustSection';

describe('ImageAdjustSection on the background photo', () => {
  it('offers the look and the flip, not crop or shadow', () => {
    const onUpdate = vi.fn();
    render(
      <ImageAdjustSection
        selectedImage={null}
        onUpdateImage={() => {}}
        backgroundPhoto={{ adjustments: { flipX: true }, onUpdate }}
      />
    );
    expect(screen.queryByText('Ausschnitt')).toBeNull();
    expect(screen.queryByText('Schatten')).toBeNull();
    expect(screen.getByText('Vignette')).toBeInTheDocument();

    const horizontal = screen.getByRole('button', { name: 'Horizontal' });
    expect(horizontal).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(horizontal);
    expect(onUpdate).toHaveBeenLastCalledWith({ flipX: false });

    fireEvent.click(screen.getByRole('button', { name: 'Warm' }));
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ temperature: 40 }));
  });
});
