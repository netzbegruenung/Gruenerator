import { MultiSelectionToolbar } from '@ggraphic/editor/components/TopBar/MultiSelectionToolbar';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

function renderBar(overrides: Partial<React.ComponentProps<typeof MultiSelectionToolbar>> = {}) {
  const props = {
    count: 3,
    canAlign: true,
    canDistribute: false,
    onCommand: vi.fn(),
    canFlip: true,
    onFlip: vi.fn(),
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

  it('nennt die Zahl, spiegelt und richtet aus', async () => {
    const onFlip = vi.fn();
    renderBar({ onFlip });
    expect(screen.getByRole('toolbar', { name: '3 Elemente' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Horizontal spiegeln/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Vertikal spiegeln/ }));
    expect(onFlip.mock.calls).toEqual([['x'], ['y']]);
    expect(screen.getByRole('button', { name: 'Position' })).toBeInTheDocument();
  });

  // Kopieren, Duplizieren, Sperren und Löschen stehen in der Pille über der Auswahl.
  it('trägt keine Objekt-Aktionen', () => {
    renderBar();
    for (const name of [/^Kopieren/, /^Duplizieren/, /perren$/, /^Löschen/, /^Auswahl aufheben/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('hat keine axe-Verstöße', async () => {
    const { container } = renderBar();
    expect(await axe(container)).toHaveNoViolations();
  });
});
