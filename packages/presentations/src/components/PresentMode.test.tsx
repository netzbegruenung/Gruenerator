/**
 * PDF export: what happens when the deck never arrives.
 *
 * `deckReady` gates the whole reveal init effect — and the 3s print fallback
 * lives inside it. So an empty Y.Doc that never syncs (Hocuspocus unreachable,
 * an id with no document) arms no timer at all: no print dialog, no error, a
 * blank tab. That is a silent dead end, not a failure the user can act on.
 */

// vitest.setup.ts already loads these matchers at runtime, but it sits outside
// this package's `rootDir: ./src`, so it cannot go in tsconfig's `include` and
// its type augmentation never reaches the checker. Import it here instead.
import '@testing-library/jest-dom/vitest';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { PresentMode } from './PresentMode.js';

// reveal.js drives layout against a real viewport; none of that is under test
// here and jsdom cannot honour it.
vi.mock('reveal.js', () => ({
  default: class {
    initialize = vi.fn(() => Promise.resolve());
    destroy = vi.fn();
    on = vi.fn();
    off = vi.fn();
    sync = vi.fn();
    layout = vi.fn();
    configure = vi.fn();
    isReady = vi.fn(() => false);
  },
}));
vi.mock('reveal.js/plugin/highlight', () => ({ default: {} }));
vi.mock('reveal.js/plugin/notes', () => ({ default: {} }));

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom ships no matchMedia; the touch-chrome effect calls it on mount.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Fake timers alone do not flush the resulting React state update. */
function passDeadline(): void {
  act(() => {
    vi.advanceTimersByTime(15000);
  });
}

describe('PresentMode — PDF export with an unsynced deck', () => {
  it('surfaces a readable error instead of leaving the tab blank', () => {
    render(<PresentMode ydoc={new Y.Doc()} onClose={vi.fn()} printPdf />);

    // Before the deadline the tab stays quiet — the deck may still be syncing.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    passDeadline();
    expect(screen.getByRole('alert')).toHaveTextContent(/konnte nicht geladen werden/i);
  });

  it('keeps the error inside the print root, or print-pdf.css would hide it', () => {
    // `html.reveal-print body > :not(.gruene-print-root)` hides every other
    // body child. Without the class the message would be invisible — exactly
    // the blank tab it exists to replace.
    render(<PresentMode ydoc={new Y.Doc()} onClose={vi.fn()} printPdf />);
    passDeadline();
    expect(screen.getByRole('alert')).toHaveClass('gruene-print-root');
  });

  it('does not arm the failure message outside the export tab', () => {
    render(<PresentMode ydoc={new Y.Doc()} onClose={vi.fn()} />);
    passDeadline();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
