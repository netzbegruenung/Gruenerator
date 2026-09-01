import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ThreadSearchBar } from './ThreadSearchBar';

/**
 * The Escape test is the one worth keeping honest. Sidebar.tsx collapses the
 * sidebar from a document-level keydown and does not check defaultPrevented,
 * so two document listeners could not be ordered. React attaches below
 * document, which is why stopping propagation on the INPUT is airtight — and
 * why moving this handler to `document` would silently reintroduce the clash.
 */
function mountViewport(html: string) {
  const viewport = document.createElement('div');
  viewport.innerHTML = html;
  document.body.replaceChildren(viewport);
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement | null }).current = viewport;
  return ref;
}

const THREE_HITS =
  '<div data-message-id="m1"><p>Wind und Wind</p></div>' +
  '<div data-message-id="m2"><p>noch mehr Wind</p></div>';

// Two jsdom gaps: it paints nothing (and collectHits drops zero-sized rects),
// and Element.scrollTo does not exist at all.
const rect = { top: 10, width: 40, height: 16 } as DOMRect;
let originalRect: typeof Range.prototype.getBoundingClientRect;

beforeEach(() => {
  originalRect = Range.prototype.getBoundingClientRect;
  Range.prototype.getBoundingClientRect = () => rect;
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
});

afterEach(() => {
  Range.prototype.getBoundingClientRect = originalRect;
  delete (Element.prototype as unknown as { scrollTo?: () => void }).scrollTo;
  vi.restoreAllMocks();
});

function renderBar(html = THREE_HITS, onClose = vi.fn()) {
  const ref = mountViewport(html);
  const utils = render(<ThreadSearchBar viewportRef={ref} focusToken={0} onClose={onClose} />);
  return { ...utils, onClose };
}

// The role="search" landmark carries the same label, so query the control.
const input = () => screen.getByRole('textbox', { name: 'Im Chat suchen' });

describe('ThreadSearchBar', () => {
  it('counts the hits and steps through them, wrapping at the end', async () => {
    renderBar();

    await userEvent.type(input(), 'wind');
    expect(await screen.findByText('1/3')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Nächster Treffer'));
    expect(screen.getByText('2/3')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Nächster Treffer'));
    await userEvent.click(screen.getByLabelText('Nächster Treffer'));
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('wraps backwards from the first hit', async () => {
    renderBar();

    await userEvent.type(input(), 'wind');
    await screen.findByText('1/3');
    await userEvent.click(screen.getByLabelText('Vorheriger Treffer'));

    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('steps with Enter and back with Shift+Enter', async () => {
    renderBar();

    await userEvent.type(input(), 'wind');
    await screen.findByText('1/3');

    await userEvent.keyboard('{Enter}');
    expect(screen.getByText('2/3')).toBeInTheDocument();

    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('disables stepping when nothing matched', async () => {
    renderBar();

    await userEvent.type(input(), 'solarpflicht');

    expect(await screen.findByText('0')).toBeInTheDocument();
    expect(screen.getByLabelText('Nächster Treffer')).toBeDisabled();
    expect(screen.getByLabelText('Vorheriger Treffer')).toBeDisabled();
  });

  it('announces the miss to screen readers', async () => {
    const { container } = renderBar();

    await userEvent.type(input(), 'solarpflicht');

    const live = container.querySelector('[aria-live="polite"]');
    await vi.waitFor(() => expect(live).toHaveTextContent('Keine Treffer'));
  });

  it('keeps Escape away from the document-level sidebar handler', async () => {
    const documentHandler = vi.fn();
    document.addEventListener('keydown', documentHandler);
    const { onClose } = renderBar();

    await userEvent.click(input());
    documentHandler.mockClear();
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(documentHandler).not.toHaveBeenCalled();

    document.removeEventListener('keydown', documentHandler);
  });

  it('closes on the close button too, not only on Escape', async () => {
    const { onClose } = renderBar();

    await userEvent.click(screen.getByLabelText('Suche schließen'));

    expect(onClose).toHaveBeenCalled();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderBar();

    await userEvent.type(input(), 'wind');

    expect(await axe(container)).toHaveNoViolations();
  });
});
