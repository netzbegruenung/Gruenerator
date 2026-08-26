import { Fab, useMeasuredCornerReservation, useScreenCornerReservation } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
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

// Eine Leiste, deren Ausdehnung gemessen statt deklariert wird — wie der
// Chat-Composer. jsdom liefert für jedes Element 0x0, also wird die Box
// gestellt; der Callback-Ref läuft vor dem Effekt, der misst.
function MeasuredBar({ left, right, top }: { left: number; right: number; top: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useMeasuredCornerReservation(ref, {
    corner: ['bottom-left', 'bottom-right'],
    axis: 'vertical',
  });
  return (
    <div
      ref={(el) => {
        if (el) {
          const box = {
            left,
            right,
            top,
            bottom: window.innerHeight - 4,
            width: right - left,
            height: window.innerHeight - 4 - top,
          };
          el.getBoundingClientRect = () => box as DOMRect;
        }
        ref.current = el;
      }}
    />
  );
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

  // jsdom: 1024x768. Der Composer klebt unten und reicht bis 16px an den
  // rechten Rand — wie auf dem Handy, wo der Stop-Knopf genau dort sitzt.
  it('rückt über eine gemessene Leiste, die bis in die Ecke reicht', () => {
    render(
      <>
        <MeasuredBar left={16} right={window.innerWidth - 16} top={700} />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    const button = screen.getByRole('button', { name: /Feedback/ });
    // 768 - 700 = 68px belegte Höhe, plus der Grundabstand. jsdom sortiert die
    // Summanden beim Serialisieren um.
    expect(button.style.bottom).toBe('calc(68px + 1rem)');
  });

  it('ignoriert eine Leiste, die vor der Ecke endet', () => {
    render(
      <>
        {/* Der zentrierte `max-w-3xl`-Composer auf dem Desktop: gleiche
            Unterkante, aber weit weg vom rechten Rand. */}
        <MeasuredBar left={128} right={896} top={700} />
        <DraggableFeedbackLauncher onOpen={vi.fn()} />
      </>
    );
    expect(screen.getByRole('button', { name: /Feedback/ }).style.bottom).toBe('1rem');
  });

  it('hat keine a11y-Verstöße', async () => {
    const { container } = render(<DraggableFeedbackLauncher onOpen={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
