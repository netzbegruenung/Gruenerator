import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { ContextControls } from '../ContextControls';

function setup(cropping = false, locked = false) {
  const crop = vi.fn();
  const view = render(
    <ContextControls
      selectedElement="photo"
      activeFloatingModule={{
        type: 'user-image',
        data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
      }}
      canMoveUp={false}
      canMoveDown={false}
      canDuplicate
      isCropping={cropping}
      lockState={locked ? 'all' : 'none'}
      handlers={{
        handleMoveLayer: () => {},
        handleDuplicate: () => {},
        handleColorSelect: () => {},
        handleOpacityChange: () => {},
        handleFontSizeChange: () => {},
        handleCropImage: crop,
      }}
    />
  );
  return { ...view, crop };
}

describe('photo crop toolbar', () => {
  it('offers crop for an ordinary upload without a cover preset', async () => {
    const { crop, container } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Zuschneiden' }));
    expect(crop).toHaveBeenCalledOnce();
    expect(await axe(container)).toHaveNoViolations();
  });
  it('offers an explicit finish action while cropping', async () => {
    const { crop } = setup(true);
    const done = screen.getByRole('button', { name: 'Fertig' });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(done);
    expect(crop).toHaveBeenCalledOnce();
  });
  it('disables cropping for locked photos', () => {
    setup(false, true);
    expect(screen.getByRole('button', { name: 'Zuschneiden' })).toBeDisabled();
  });
});
