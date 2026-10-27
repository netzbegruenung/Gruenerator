import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { MultiSelectionToolbar } from '../MultiSelectionToolbar';

function renderBar(overrides: Partial<React.ComponentProps<typeof MultiSelectionToolbar>> = {}) {
  const props = {
    count: 3,
    canCopy: true,
    canDelete: true,
    lockState: 'none' as const,
    canLock: true,
    canAlign: true,
    canDistribute: false,
    onCommand: vi.fn(),
    canFlip: true,
    onFlip: vi.fn(),
    onCopy: vi.fn(),
    onDuplicate: vi.fn(),
    onToggleLock: vi.fn(),
    onDelete: vi.fn(),
    onDeselect: vi.fn(),
    ...overrides,
  };
  return { ...render(<MultiSelectionToolbar {...props} />), props };
}

describe('Leiste der Mehrfachauswahl', () => {
  it('is one tab stop; arrows move between its buttons', async () => {
    renderBar();
    const stops = screen.getAllByRole('button').filter((b) => b.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    stops[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(stops[0]).not.toHaveFocus();
    expect(screen.getByRole('toolbar')).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Home}');
    expect(stops[0]).toHaveFocus();
  });

  it('nennt die Zahl und bietet, was für alle gleich geht', async () => {
    const { props } = renderBar();
    expect(screen.getByRole('toolbar', { name: '3 Elemente' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Kopieren/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Duplizieren/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    await userEvent.click(screen.getByRole('button', { name: /^Löschen/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Auswahl aufheben (Esc)' }));
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.onDuplicate).toHaveBeenCalledTimes(1);
    expect(props.onToggleLock).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    expect(props.onDeselect).toHaveBeenCalledTimes(1);
  });

  it('zeigt eine ganz gesperrte Auswahl als gedrückten Entsperren-Knopf', () => {
    renderBar({ lockState: 'all' });
    expect(screen.getByRole('button', { name: 'Entsperren' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('lässt Löschen aus, wenn nichts davon löschbar ist', () => {
    renderBar({ canDelete: false });
    expect(screen.getByRole('button', { name: /^Löschen/ })).toBeDisabled();
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = renderBar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
