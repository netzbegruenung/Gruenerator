import { fireEvent, render, screen } from '@testing-library/react';
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
  it('offers the aspect presets for an own image while cropping, not for the background', async () => {
    const aspect = vi.fn();
    const handlers = {
      handleMoveLayer: () => {},
      handleDuplicate: () => {},
      handleColorSelect: () => {},
      handleOpacityChange: () => {},
      handleFontSizeChange: () => {},
      handleCancelCrop: () => {},
      handleFinishCrop: () => {},
      handleCropAspect: aspect,
    };
    const { container, unmount } = render(
      <ContextControls
        selectedElement="photo"
        activeFloatingModule={{
          type: 'user-image',
          data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
        }}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        isCropping
        cropAspect="4:5"
        handlers={handlers}
      />
    );
    const select = screen.getByRole('combobox', { name: 'Seitenverhältnis' });
    expect(select).toHaveValue('4:5');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Freiform',
      'Original',
      '1:1',
      '4:5',
      '9:16',
      '16:9',
      '4:3',
      '3:4',
    ]);
    await userEvent.selectOptions(select, '16:9');
    expect(aspect).toHaveBeenCalledWith('16:9');
    expect(await axe(container)).toHaveNoViolations();
    unmount();

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
        handlers={handlers}
      />
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });
  it('offers Begradigen for an own image and the background photo, desktop and mobile', async () => {
    const rotate = vi.fn();
    const handlers = {
      handleMoveLayer: () => {},
      handleDuplicate: () => {},
      handleColorSelect: () => {},
      handleOpacityChange: () => {},
      handleFontSizeChange: () => {},
      handleCancelCrop: () => {},
      handleFinishCrop: () => {},
      handleCropRotation: rotate,
    };
    const modules = [
      {
        type: 'user-image' as const,
        data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
      },
      {
        type: 'image' as const,
        data: { id: 'background-image', isPhoto: true, canCrop: true },
      },
    ];
    for (const module of modules) {
      for (const Bar of [ContextControls, MobileSelectionBar]) {
        rotate.mockClear();
        const { container, unmount } = render(
          <Bar
            selectedElement={module.data.id}
            activeFloatingModule={module}
            canMoveUp={false}
            canMoveDown={false}
            canDuplicate={false}
            isCropping
            cropRotation={-12}
            handlers={handlers}
            onDone={() => {}}
          />
        );
        const slider = screen.getByRole('slider', { name: 'Begradigen' });
        expect(slider).toHaveValue('-12');
        expect(slider).toHaveAttribute('min', '-45');
        expect(slider).toHaveAttribute('max', '45');
        expect(slider).toHaveAttribute('step', '1');
        const field = screen.getByRole('spinbutton', { name: 'Begradigen in Grad' });
        expect(field).toHaveValue(-12);
        fireEvent.change(slider, { target: { value: '30' } });
        expect(rotate).toHaveBeenLastCalledWith(30);
        fireEvent.change(field, { target: { value: '80' } });
        expect(rotate).toHaveBeenLastCalledWith(45);
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
          'Abbrechen',
          'Fertig',
        ]);
        expect(await axe(container)).toHaveNoViolations();
        unmount();
      }
    }
  });
  it('offers Automatisch for an own image and the background photo, desktop and mobile', async () => {
    const auto = vi.fn();
    const handlers = {
      handleMoveLayer: () => {},
      handleDuplicate: () => {},
      handleColorSelect: () => {},
      handleOpacityChange: () => {},
      handleFontSizeChange: () => {},
      handleCancelCrop: () => {},
      handleFinishCrop: () => {},
      handleSmartCrop: auto,
    };
    const modules = [
      {
        type: 'user-image' as const,
        data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
      },
      {
        type: 'image' as const,
        data: { id: 'background-image', isPhoto: true, canCrop: true },
      },
    ];
    for (const module of modules) {
      for (const Bar of [ContextControls, MobileSelectionBar]) {
        auto.mockClear();
        const { container, unmount } = render(
          <Bar
            selectedElement={module.data.id}
            activeFloatingModule={module}
            canMoveUp={false}
            canMoveDown={false}
            canDuplicate={false}
            isCropping
            handlers={handlers}
            onDone={() => {}}
          />
        );
        const button = screen.getByRole('button', { name: 'Ausschnitt automatisch wählen' });
        expect(button).toHaveTextContent(/^Automatisch$/);
        await userEvent.click(button);
        expect(auto).toHaveBeenCalledOnce();
        expect(await axe(container)).toHaveNoViolations();
        unmount();
      }
    }
  });
  it('disables cropping for locked photos', () => {
    setup(false, true);
    expect(screen.getByRole('button', { name: 'Zuschneiden' })).toBeDisabled();
  });
});
