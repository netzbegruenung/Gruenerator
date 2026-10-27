import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../../CanvasEditorProvider';
import { axe } from '../../../test-utils';

const uploads = vi.hoisted(() => ({ available: true }));
vi.mock('../../../sidebar/UserUploadsProvider', () => ({
  useOptionalUserUploads: () => (uploads.available ? { upload: async () => null } : null),
}));
import { ContextControls } from '../ContextControls';
import { CropModeControls } from '../CropModeControls';
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
        expect(field).toHaveValue('-12');
        fireEvent.change(slider, { target: { value: '30' } });
        expect(rotate).toHaveBeenLastCalledWith(30);
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: '80' } });
        fireEvent.blur(field);
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
  it('Begradigen in Grad: tippt in einen Entwurf, übernimmt mit Enter oder Verlassen', async () => {
    const committed: number[] = [];
    function Harness() {
      const [deg, setDeg] = useState(0);
      return (
        <CropModeControls
          onCancel={() => {}}
          onDone={() => {}}
          straighten={{
            value: deg,
            onChange: (next) => {
              committed.push(next);
              setDeg(next);
            },
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole('spinbutton', { name: 'Begradigen in Grad' });
    const slider = screen.getByRole('slider', { name: 'Begradigen' });

    // Mehrstellig: der erste Tastendruck übernimmt nichts und überschreibt nichts.
    await user.click(field);
    await user.keyboard('12');
    expect(field).toHaveValue('12');
    expect(committed).toEqual([]);
    await user.keyboard('{Enter}');
    expect(committed).toEqual([12]);
    expect(slider).toHaveValue('12');

    // Negativ: ein einzelnes „-" bleibt stehen.
    await user.clear(field);
    await user.keyboard('-');
    expect(field).toHaveValue('-');
    await user.keyboard('30');
    await user.tab();
    expect(committed.at(-1)).toBe(-30);
    expect(field).toHaveValue('-30');

    // Außerhalb des Bereichs: Enter begrenzt auf 45.
    await user.click(field);
    await user.keyboard('{Control>}a{/Control}99{Enter}');
    expect(committed.at(-1)).toBe(45);
    expect(field).toHaveValue('45');

    // Escape verwirft den Entwurf und übernimmt nichts.
    const before = committed.length;
    await user.keyboard('{Control>}a{/Control}7{Escape}');
    expect(field).toHaveValue('45');
    await user.tab();
    expect(committed).toHaveLength(before);

    // Pfeile stufen um 1 und übernehmen sofort.
    await user.click(field);
    await user.keyboard('{ArrowDown}');
    expect(committed.at(-1)).toBe(44);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(committed.at(-1)).toBe(45);
    expect(field).toHaveValue('45');
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
  it('offers Erweitern only with the host service, desktop and mobile, and waits while it runs', async () => {
    const expand = vi.fn();
    const handlers = {
      handleMoveLayer: () => {},
      handleDuplicate: () => {},
      handleColorSelect: () => {},
      handleOpacityChange: () => {},
      handleFontSizeChange: () => {},
      handleCancelCrop: () => {},
      handleFinishCrop: () => {},
      handleExpandImage: expand,
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
    const services = { expandImage: async (file: File) => file };
    for (const module of modules) {
      for (const Bar of [ContextControls, MobileSelectionBar]) {
        const bar = (busy: boolean) => (
          <Bar
            selectedElement={module.data.id}
            activeFloatingModule={module}
            canMoveUp={false}
            canMoveDown={false}
            canDuplicate={false}
            isCropping
            isExpanding={busy}
            handlers={handlers}
            onDone={() => {}}
          />
        );
        // Ohne Dienst kein Knopf.
        const bare = render(bar(false));
        expect(screen.queryByRole('button', { name: /Erweitern/ })).toBeNull();
        bare.unmount();
        // Ohne Uploads auch nicht: das Ergebnis muss hochgeladen werden.
        uploads.available = false;
        const offline = render(
          <CanvasEditorProvider services={services}>{bar(false)}</CanvasEditorProvider>
        );
        expect(screen.queryByRole('button', { name: /Erweitern/ })).toBeNull();
        offline.unmount();
        uploads.available = true;

        expand.mockClear();
        const { container, rerender, unmount } = render(
          <CanvasEditorProvider services={services}>{bar(false)}</CanvasEditorProvider>
        );
        const button = screen.getByRole('button', { name: 'Erweitern' });
        expect(button).toBeEnabled();
        await userEvent.click(button);
        expect(expand).toHaveBeenCalledOnce();
        expect(await axe(container)).toHaveNoViolations();

        rerender(<CanvasEditorProvider services={services}>{bar(true)}</CanvasEditorProvider>);
        const busy = screen.getByRole('button', { name: 'Erweitern' });
        expect(busy).toBeDisabled();
        expect(busy).toHaveAttribute('aria-busy', 'true');
        await userEvent.click(busy);
        expect(expand).toHaveBeenCalledOnce();
        unmount();
      }
    }
  });
  it('mobile: Abbrechen and Fertig stay outside the scroller, Begradigen gets its own row', () => {
    const { container } = render(
      <CanvasEditorProvider services={{ expandImage: async (file: File) => file }}>
        <MobileSelectionBar
          selectedElement="photo"
          activeFloatingModule={{
            type: 'user-image',
            data: { id: 'photo', src: '/photo.jpg', width: 600, height: 400 },
          }}
          canMoveUp={false}
          canMoveDown={false}
          canDuplicate={false}
          isCropping
          cropRotation={5}
          handlers={{
            handleMoveLayer: () => {},
            handleDuplicate: () => {},
            handleColorSelect: () => {},
            handleOpacityChange: () => {},
            handleFontSizeChange: () => {},
            handleCancelCrop: () => {},
            handleFinishCrop: () => {},
            handleCropAspect: () => {},
            handleCropRotation: () => {},
            handleSmartCrop: () => {},
            handleExpandImage: () => {},
          }}
          onDone={() => {}}
        />
      </CanvasEditorProvider>
    );
    const scrollers = [...container.querySelectorAll<HTMLElement>('.overflow-x-auto')];
    expect(scrollers).toHaveLength(1);
    const [tools] = scrollers;
    for (const name of ['Abbrechen', 'Fertig']) {
      expect(tools!.contains(screen.getByRole('button', { name }))).toBe(false);
    }
    // Wer zu den Ausgängen wischt, wischt nicht über den Regler.
    expect(tools!.contains(screen.getByRole('slider', { name: 'Begradigen' }))).toBe(false);
    expect(tools!.contains(screen.getByRole('button', { name: 'Erweitern' }))).toBe(true);
    expect(tools!.contains(screen.getByRole('combobox', { name: 'Seitenverhältnis' }))).toBe(true);
    // Eine Leiste, ein Tab-Halt: auch die Eingaben gehören zum Roving.
    const stops = [...container.querySelectorAll('button, input, select')].filter(
      (el) => el.getAttribute('tabindex') === '0'
    );
    expect(stops).toHaveLength(1);
  });
  it('disables cropping for locked photos', () => {
    setup(false, true);
    expect(screen.getByRole('button', { name: 'Zuschneiden' })).toBeDisabled();
  });
});
