import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionCards } from './MarketplaceCollections';

const collections = [
  { collectionId: 'europa' as const, items: [] },
  { collectionId: 'queer' as const, items: [] },
];

beforeAll(() => {
  // jsdom has neither pointer capture nor scrolling; the row only needs them to exist.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.scrollTo ??= () => {};
});

const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 };

/** Presses the first card's button, moves by `dx` and lets go. */
function drag(card: HTMLElement, dx: number, init = mouse) {
  fireEvent.pointerDown(card, { ...init, clientX: 100 });
  fireEvent.pointerMove(card, { ...init, clientX: 100 + dx });
  fireEvent.pointerUp(card, { ...init, buttons: 0, clientX: 100 + dx });
}

function renderRow() {
  const onOpen = vi.fn();
  render(<CollectionCards title={null} scroll collections={collections} onOpen={onOpen} />);
  const [card] = screen.getAllByRole('button');
  if (!card) throw new Error('no card');
  return { onOpen, card };
}

describe('CollectionCards scroll row', () => {
  it('opens a card on a plain click', () => {
    const { onOpen, card } = renderRow();
    drag(card, 2);
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('europa');
  });

  it('does not open the card a mouse drag ends on', () => {
    const { onOpen, card } = renderRow();
    drag(card, -40);
    fireEvent.click(card);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lets a later keyboard activation through after a drag', async () => {
    const { onOpen, card } = renderRow();
    drag(card, -40);
    // No pointerdown precedes Enter on a focused card; it comes in a later task.
    await new Promise((r) => setTimeout(r));
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('europa');
  });

  it('lets the next click through after a drag that was cancelled', () => {
    const { onOpen, card } = renderRow();
    fireEvent.pointerDown(card, { ...mouse, clientX: 100 });
    fireEvent.pointerMove(card, { ...mouse, clientX: 60 });
    fireEvent.pointerCancel(card, { ...mouse, clientX: 60 });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('europa');
  });

  it('leaves touch to native scrolling', () => {
    const { onOpen, card } = renderRow();
    const capture = vi.spyOn(Element.prototype, 'setPointerCapture');
    drag(card, -40, { ...mouse, pointerType: 'touch' });
    fireEvent.click(card);
    expect(capture).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith('europa');
    capture.mockRestore();
  });

  it('adds no region of its own without a title', () => {
    render(<CollectionCards title={null} scroll collections={collections} onOpen={vi.fn()} />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('keeps the titled section a labelled region', () => {
    render(<CollectionCards title="Kollektionen" collections={collections} onOpen={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Kollektionen' })).toBeInTheDocument();
  });
});
