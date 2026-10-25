import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { ContextControls } from '../ContextControls';
import { FloatingRotateFlipControl } from '../modules/FloatingRotateFlipControl';
import { MultiSelectionToolbar } from '../MultiSelectionToolbar';

/**
 * Drehen & Spiegeln in der Kontextleiste: ein Knopf, ein Popover mit Feld,
 * Regler, 90°-Schritten und — nur wo das Element spiegelt — den Spiegel-Knöpfen.
 * Der Regler schreibt einmal pro Zug: Vorschau bei jedem Bild, Abschluss am Ende.
 */

function renderControl(
  overrides: Partial<React.ComponentProps<typeof FloatingRotateFlipControl>> = {}
) {
  const props = {
    rotation: 0,
    canFlip: true,
    onRotationCommit: vi.fn(),
    onRotationPreview: vi.fn(),
    onFlip: vi.fn(),
    ...overrides,
  };
  return { ...render(<FloatingRotateFlipControl {...props} />), props };
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Drehen & Spiegeln' }));

describe('Drehen & Spiegeln', () => {
  it('übernimmt eine getippte Drehung mit Enter genau einmal', async () => {
    const { props } = renderControl();
    await open();
    const field = screen.getByRole('spinbutton', { name: 'Drehung' });
    await userEvent.clear(field);
    await userEvent.type(field, '45{Enter}');
    field.blur();
    expect(props.onRotationCommit).toHaveBeenCalledTimes(1);
    expect(props.onRotationCommit).toHaveBeenCalledWith(45);
  });

  it('übernimmt beim Verlassen des Felds und begrenzt auf ±180°', async () => {
    const { props } = renderControl();
    await open();
    const field = screen.getByRole('spinbutton', { name: 'Drehung' });
    await userEvent.clear(field);
    await userEvent.type(field, '270');
    fireEvent.blur(field);
    expect(props.onRotationCommit).toHaveBeenCalledWith(180);
  });

  it('verwirft mit Escape den getippten Wert, ohne zu übernehmen', async () => {
    const { props } = renderControl({ rotation: 30 });
    await open();
    const field = screen.getByRole('spinbutton', { name: 'Drehung' });
    await userEvent.clear(field);
    await userEvent.type(field, '99');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue(30);
    fireEvent.blur(field);
    expect(props.onRotationCommit).not.toHaveBeenCalled();
  });

  it('dreht in 90°-Schritten und bleibt dabei in (−180, 180]', async () => {
    const { props } = renderControl({ rotation: 120 });
    await open();
    await userEvent.click(screen.getByRole('button', { name: '90° nach rechts' }));
    expect(props.onRotationCommit).toHaveBeenLastCalledWith(-150);
    await userEvent.click(screen.getByRole('button', { name: '90° nach links' }));
    expect(props.onRotationCommit).toHaveBeenLastCalledWith(30);
  });

  it('spiegelt über die beiden Knöpfe und nennt die Kürzel', async () => {
    const { props } = renderControl();
    await open();
    const horizontal = screen.getByRole('button', { name: /^Horizontal spiegeln/ });
    expect(horizontal).toHaveAttribute('aria-keyshortcuts', 'Shift+H');
    await userEvent.click(horizontal);
    await userEvent.click(screen.getByRole('button', { name: /^Vertikal spiegeln/ }));
    expect(vi.mocked(props.onFlip).mock.calls).toEqual([['x'], ['y']]);
  });

  it('zeigt keine Spiegel-Knöpfe, wenn das Element nicht spiegelt', async () => {
    renderControl({ canFlip: false });
    await open();
    expect(screen.queryByRole('button', { name: /spiegeln/ })).toBeNull();
    expect(screen.getByRole('button', { name: '90° nach rechts' })).toBeInTheDocument();
  });

  it('hat keine axe-Verstöße, auch nicht im offenen Popover', async () => {
    const { container } = renderControl();
    expect(await axe(container)).toHaveNoViolations();
    await open();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  describe('Regler', () => {
    const rect = {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 360,
      bottom: 20,
      width: 360,
      height: 20,
      toJSON: () => ({}),
    };
    let captured = false;
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
      HTMLElement.prototype.setPointerCapture = () => {
        captured = true;
      };
      HTMLElement.prototype.hasPointerCapture = () => captured;
      HTMLElement.prototype.releasePointerCapture = () => {
        captured = false;
      };
    });
    afterEach(() => {
      vi.restoreAllMocks();
      captured = false;
    });

    const track = () => screen.getByRole('slider', { name: 'Drehung' }).closest('[dir]')!;
    const pointer = { pointerId: 1, button: 0, pointerType: 'mouse' };

    it('zeigt beim Ziehen nur Vorschau und schreibt einmal am Ende', async () => {
      const { props } = renderControl();
      await open();
      const slider = track();
      fireEvent.pointerDown(slider, { ...pointer, clientX: 180 });
      fireEvent.pointerMove(slider, { ...pointer, clientX: 225 });
      fireEvent.pointerMove(slider, { ...pointer, clientX: 270 });
      fireEvent.pointerUp(slider, { ...pointer, clientX: 270 });
      expect(props.onRotationPreview).toHaveBeenCalledTimes(2);
      expect(props.onRotationPreview).toHaveBeenLastCalledWith(90);
      expect(props.onRotationCommit).toHaveBeenCalledTimes(1);
      expect(props.onRotationCommit).toHaveBeenCalledWith(90);
    });

    it('schreibt eine abgebrochene Vorschau fest, wenn das Popover schließt', async () => {
      const { props } = renderControl();
      await open();
      const slider = track();
      fireEvent.pointerDown(slider, { ...pointer, clientX: 180 });
      fireEvent.pointerMove(slider, { ...pointer, clientX: 225 });
      expect(props.onRotationCommit).not.toHaveBeenCalled();
      await userEvent.keyboard('{Escape}');
      expect(props.onRotationCommit).toHaveBeenCalledTimes(1);
      expect(props.onRotationCommit).toHaveBeenCalledWith(45);
    });

    it('schreibt eine abgebrochene Vorschau fest, wenn die Leiste verschwindet', async () => {
      const { props, unmount } = renderControl();
      await open();
      const slider = track();
      fireEvent.pointerDown(slider, { ...pointer, clientX: 180 });
      fireEvent.pointerMove(slider, { ...pointer, clientX: 135 });
      act(() => unmount());
      expect(props.onRotationCommit).toHaveBeenCalledWith(-45);
    });
  });
});

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
  handleSetRotation: () => {},
  handlePreviewRotation: () => {},
  handleFlip: () => {},
};

describe('Kontextleiste', () => {
  const renderBar = (overrides: Partial<React.ComponentProps<typeof ContextControls>> = {}) =>
    render(
      <ContextControls
        selectedElement="shape-1"
        activeFloatingModule={{ type: 'shape', data: { id: 'shape-1', fill: '#005538' } }}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        canRotate
        canFlip
        rotation={0}
        handlers={HANDLERS}
        {...overrides}
      />
    );

  it('bietet Drehen & Spiegeln nur an, wenn die Auswahl sich drehen lässt', () => {
    const { unmount } = renderBar();
    expect(screen.getByRole('button', { name: 'Drehen & Spiegeln' })).toBeInTheDocument();
    unmount();
    renderBar({ canRotate: false });
    expect(screen.queryByRole('button', { name: 'Drehen & Spiegeln' })).toBeNull();
  });

  it('steht auch in der mobilen Auswahl-Leiste', () => {
    renderBar({ hideObjectActions: true });
    expect(screen.getByRole('button', { name: 'Drehen & Spiegeln' })).toBeInTheDocument();
  });
});

describe('Leiste der Mehrfachauswahl', () => {
  const props = {
    count: 2,
    canCopy: true,
    canDelete: true,
    lockState: 'none' as const,
    canLock: true,
    onCopy: () => {},
    onDuplicate: () => {},
    onToggleLock: () => {},
    onDelete: () => {},
    onDeselect: () => {},
  };

  it('spiegelt die Auswahl, wenn sie spiegeln kann', async () => {
    const onFlip = vi.fn();
    render(<MultiSelectionToolbar {...props} canFlip onFlip={onFlip} />);
    await userEvent.click(screen.getByRole('button', { name: /^Horizontal spiegeln/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Vertikal spiegeln/ }));
    expect(onFlip.mock.calls).toEqual([['x'], ['y']]);
  });

  it('lässt die Spiegel-Knöpfe weg, wenn nicht', () => {
    render(<MultiSelectionToolbar {...props} canFlip={false} onFlip={() => {}} />);
    expect(screen.queryByRole('button', { name: /spiegeln/ })).toBeNull();
  });
});
