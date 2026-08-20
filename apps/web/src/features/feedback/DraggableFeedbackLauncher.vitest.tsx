import { Fab, useScreenCornerReservation } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import DraggableFeedbackLauncher from './DraggableFeedbackLauncher';

// Die Ecke wird persistiert; ohne Aufräumen erbt der nächste Test sie.
afterEach(() => localStorage.clear());

function Occupant({ horizontal, blocked }: { horizontal?: string; blocked?: boolean }) {
  useScreenCornerReservation({
    corner: 'bottom-right',
    ...(horizontal == null ? {} : { horizontal }),
    ...(blocked == null ? {} : { blocked }),
  });
  return null;
}

describe('DraggableFeedbackLauncher', () => {
  it('klebt ohne Nachbarn an der Ecke', () => {
    render(<DraggableFeedbackLauncher onOpen={vi.fn()} />);
    const button = screen.getByRole('button', { name: /Feedback/ });
    expect(button.style.bottom).toBe('1rem');
    expect(button.style.right).toBe('1rem');
  });

  it('rückt über einen FAB, der dieselbe Ecke belegt', () => {
    render(
      <>
        <Fab icon={<span />} aria-label="Assistent" />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    const button = screen.getByRole('button', { name: /^Feedback$/ });
    expect(button.style.bottom).toBe('calc(1rem + calc(4.5rem + env(safe-area-inset-bottom)))');
    // Die freie Achse bleibt unangetastet.
    expect(button.style.right).toBe('1rem');
  });

  it('verrechnet mehrere Anmeldungen an derselben Ecke als max()', () => {
    render(
      <>
        <Occupant horizontal="20rem" />
        <Occupant horizontal="28rem" />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    const button = screen.getByRole('button', { name: /Feedback/ });
    // jsdoms CSS-Parser faltet einheitengleiche Summanden zusammen; 29rem ist
    // genau `1rem + max(20rem, 28rem)` und belegt damit die Verrechnung.
    expect(button.style.right).toBe('calc(29rem)');
  });

  it('gibt die Ecke wieder frei, wenn der Nachbar verschwindet', () => {
    const { rerender } = render(
      <>
        <Occupant horizontal="20rem" />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    expect(screen.getByRole('button', { name: /Feedback/ }).style.right).toBe('calc(21rem)');

    rerender(<DraggableFeedbackLauncher onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Feedback/ }).style.right).toBe('1rem');
  });

  it('verschwindet, wenn ein Vollbild-Panel die Ecke zudeckt', () => {
    render(
      <>
        <Occupant blocked />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    expect(screen.queryByRole('button', { name: /Feedback/ })).not.toBeInTheDocument();
  });

  it('reagiert nur auf die Ecke, an der er gerade hängt', () => {
    localStorage.setItem('feedback-launcher-corner', 'bottom-left');
    render(
      <>
        <Occupant horizontal="20rem" />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    const button = screen.getByRole('button', { name: /Feedback/ });
    expect(button.style.left).toBe('1rem');
    expect(button.style.right).toBe('');
  });

  it('hat keine a11y-Verstöße', async () => {
    const { container } = render(<DraggableFeedbackLauncher onOpen={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
