import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { ContextControls } from '../ContextControls';
import { MobileSelectionBar } from '../MobileSelectionBar';

function setup(cropping = false, locked = false) {
  const crop = vi.fn();
  const cancel = vi.fn();
  const finish = vi.fn();
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
        handleCancelCrop: cancel,
        handleFinishCrop: finish,
      }}
    />
  );
  return { ...view, crop, cancel, finish };
}

describe('photo crop toolbar', () => {
  it('offers crop for an ordinary upload without a cover preset', async () => {
    const { crop, container } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Zuschneiden' }));
    expect(crop).toHaveBeenCalledOnce();
    expect(await axe(container)).toHaveNoViolations();
  });
  it('shows only Abbrechen and Fertig while cropping', async () => {
    const { crop, cancel, finish, container } = setup(true);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Abbrechen',
      'Fertig',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(cancel).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(finish).toHaveBeenCalledOnce();
    expect(crop).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });
  it('shows the crop bar for the background photo too', () => {
    render(
      <ContextControls
        selectedElement="background-image"
        activeFloatingModule={{
          type: 'image',
          data: { id: 'background-image', isPhoto: true, canCrop: true },
        }}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate={false}
        isCropping
        handlers={{
          handleMoveLayer: () => {},
          handleDuplicate: () => {},
          handleColorSelect: () => {},
          handleOpacityChange: () => {},
          handleFontSizeChange: () => {},
          handleCropImage: () => {},
          handleCancelCrop: () => {},
          handleFinishCrop: () => {},
        }}
        background={{ scale: 1, onScaleChange: () => {} }}
      />
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Abbrechen',
      'Fertig',
    ]);
  });
  it('mobile: the selection bar keeps only the crop exits, without Mehr and ✓', () => {
    const done = vi.fn();
    render(
      <MobileSelectionBar
        selectedElement="photo"
        activeFloatingModule={{
          type: 'user-image',
          data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
        }}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        isCropping
        handlers={{
          handleMoveLayer: () => {},
          handleDuplicate: () => {},
          handleColorSelect: () => {},
          handleOpacityChange: () => {},
          handleFontSizeChange: () => {},
          handleCancelCrop: () => {},
          handleFinishCrop: () => {},
        }}
        onOpenArea={() => {}}
        onDone={done}
      />
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Abbrechen',
      'Fertig',
    ]);
  });
  it('disables cropping for locked photos', () => {
    setup(false, true);
    expect(screen.getByRole('button', { name: 'Zuschneiden' })).toBeDisabled();
  });
});
