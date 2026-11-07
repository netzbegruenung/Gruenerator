import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axe, renderWithProviders } from '../../test-utils';

import { SlideStack, useAutoAdvance } from './slides';

const SLIDES = [
  { key: 'a', label: 'Erste Folie', content: <p>Inhalt A</p> },
  { key: 'b', label: 'Zweite Folie', content: <p>Inhalt B</p> },
  { key: 'c', label: 'Dritte Folie', content: <p>Inhalt C</p> },
];

const slide = (label: string) => screen.getByLabelText(label, { selector: 'div' });

describe('SlideStack', () => {
  it('switches by swiping sideways, but leaves vertical scrolling alone', () => {
    renderWithProviders(<SlideStack slides={SLIDES} />);
    const carousel = slide('Erste Folie').parentElement!.parentElement!;

    fireEvent.touchStart(carousel, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 120, clientY: 110 }] });
    expect(slide('Zweite Folie')).not.toHaveAttribute('inert');
    expect(slide('Erste Folie')).toHaveAttribute('inert');

    // Mehr senkrecht als waagerecht: Scrollen, kein Wechsel.
    fireEvent.touchStart(carousel, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 150, clientY: 300 }] });
    expect(slide('Zweite Folie')).not.toHaveAttribute('inert');

    fireEvent.touchStart(carousel, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    expect(slide('Erste Folie')).not.toHaveAttribute('inert');
  });

  it('moves between the dots with the arrow keys and announces the slide', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SlideStack slides={SLIDES} />);

    await user.click(screen.getByRole('button', { name: 'Erste Folie' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Zweite Folie' })).toHaveFocus();
    expect(slide('Zweite Folie')).not.toHaveAttribute('inert');
    expect(screen.getByText('Zweite Folie, 2 von 3')).toHaveAttribute('aria-live', 'polite');

    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Dritte Folie' })).toHaveAttribute(
      'aria-current',
      'true'
    );
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Erste Folie' })).toHaveFocus();
  });

  it('shows a single slide without dots', () => {
    renderWithProviders(<SlideStack slides={SLIDES.slice(0, 1)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(slide('Erste Folie')).not.toHaveAttribute('inert');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<SlideStack slides={SLIDES} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('useAutoAdvance', () => {
  afterEach(() => vi.useRealTimers());

  function Rotating() {
    const { active, playing, togglePlaying } = useAutoAdvance(3, 1000);
    return (
      <>
        <span data-testid="active">{active}</span>
        <button type="button" onClick={togglePlaying}>
          {playing ? 'Anhalten' : 'Fortsetzen'}
        </button>
      </>
    );
  }

  it('rotates on its own until it is paused, and resumes on request', async () => {
    vi.useFakeTimers();
    renderWithProviders(<Rotating />);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Anhalten' }));
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Fortsetzen' }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('2');
  });

  it('does not rotate at all without an interval', async () => {
    vi.useFakeTimers();
    function Manual() {
      const { active, playing } = useAutoAdvance(3, null);
      return <span data-testid="state">{`${active}:${String(playing)}`}</span>;
    }
    renderWithProviders(<Manual />);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('0:false');
  });
});
