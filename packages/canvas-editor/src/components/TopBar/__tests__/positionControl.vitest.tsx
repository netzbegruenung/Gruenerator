import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { FloatingPositionControl } from '../modules/FloatingPositionControl';

import type { SelectionGeometry } from '@ggraphic/editor/utils/canvasCommands';

const GEOMETRY: SelectionGeometry = { x: 10.4, y: 20, width: 300, height: 100, resize: 'width' };

function renderControl(
  overrides: Partial<React.ComponentProps<typeof FloatingPositionControl>> = {}
) {
  const props = {
    canDistribute: false,
    ...overrides,
    onCommand: vi.fn<(id: string) => void>(),
  };
  return { ...render(<FloatingPositionControl {...props} />), props };
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Position' }));

describe('Positionsfeld', () => {
  it('ruft die sechs Ausrichte-Befehle', async () => {
    const { props } = renderControl({ getGeometry: () => GEOMETRY });
    await open();
    for (const label of ['Links', 'Zentriert', 'Rechts', 'Oben', 'Mitte', 'Unten']) {
      await userEvent.click(screen.getByRole('button', { name: label }));
    }
    expect(props.onCommand.mock.calls.map((c) => c[0])).toEqual([
      'alignLeft',
      'alignCenterH',
      'alignRight',
      'alignTop',
      'alignMiddle',
      'alignBottom',
    ]);
  });

  it('zeigt X, Y, B, H gerundet; H ist bei Text gesperrt; kein Verteilen bei Einzelauswahl', async () => {
    renderControl({ getGeometry: () => GEOMETRY });
    await open();
    expect(screen.getByRole('textbox', { name: 'X' })).toHaveValue('10');
    expect(screen.getByRole('textbox', { name: 'B' })).toHaveValue('300');
    expect(screen.getByRole('textbox', { name: 'H' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Horizontal verteilen' })).toBeNull();
  });

  it('schreibt X einmal beim Enter, nicht beim Tippen', async () => {
    const onPositionChange = vi.fn();
    renderControl({ getGeometry: () => GEOMETRY, onPositionChange });
    await open();
    const x = screen.getByRole('textbox', { name: 'X' });
    await userEvent.clear(x);
    await userEvent.type(x, '120');
    expect(onPositionChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenCalledWith({ x: 120 });
  });

  it('schreibt beim Verlassen, nimmt Komma, verwirft Unsinn und Unverändertes', async () => {
    const onSizeChange = vi.fn();
    const onPositionChange = vi.fn();
    renderControl({ getGeometry: () => GEOMETRY, onSizeChange, onPositionChange });
    await open();
    const b = screen.getByRole('textbox', { name: 'B' });
    await userEvent.clear(b);
    await userEvent.type(b, '250,5');
    await userEvent.tab();
    expect(onSizeChange).toHaveBeenCalledWith({ width: 250.5 });

    const y = screen.getByRole('textbox', { name: 'Y' });
    await userEvent.clear(y);
    await userEvent.type(y, 'abc');
    await userEvent.tab();
    expect(y).toHaveValue('20');
    await userEvent.click(screen.getByRole('textbox', { name: 'X' }));
    await userEvent.tab();
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('bietet in der Mehrfachauswahl Verteilen statt Feldern', async () => {
    const { props } = renderControl({ canDistribute: true });
    await open();
    expect(screen.queryByRole('textbox', { name: 'X' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Horizontal verteilen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vertikal verteilen' }));
    expect(props.onCommand).toHaveBeenLastCalledWith('distributeVertical');
  });

  it('lässt Verteilen unter drei Elementen sichtbar, aber aus', async () => {
    renderControl({ canDistribute: false });
    await open();
    expect(screen.getByRole('button', { name: 'Horizontal verteilen' })).toBeDisabled();
  });

  it('hat keine axe-Verstöße', async () => {
    const { baseElement } = renderControl({ getGeometry: () => GEOMETRY });
    await open();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
