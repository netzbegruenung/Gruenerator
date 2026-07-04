import { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import Reveal from 'reveal.js';
import * as Y from 'yjs';

import { useSlides } from '../collab/useSlides.js';

import { SlideSurface } from './SlideSurface.js';

import 'reveal.js/reveal.css';
import './theme/gruene-deck.css';

export interface PresentModeProps {
  ydoc: Y.Doc;
  onClose: () => void;
  /** Reveal auto-detects `?print-pdf` in the URL; when set we also trigger the
   * browser print dialog once the deck is laid out. */
  printPdf?: boolean;
}

type RevealApi = InstanceType<typeof Reveal>;

/**
 * Fullscreen reveal.js deck. This is the ONLY module that imports reveal.js +
 * its CSS, so the global styles never load until the user presents. Uses raw
 * reveal.js (not the 0.2.x React wrapper) for full control over classNames,
 * print-pdf, and lifecycle. Rebuilds via `sync()` when slides change.
 */
export function PresentMode({ ydoc, onClose, printPdf }: PresentModeProps) {
  const { slides, defaultTransition } = useSlides(ydoc);
  const deckRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<RevealApi | null>(null);

  // Initialize once. defaultTransition is read at init; changing it mid-present
  // is rare and not worth a re-init.
  const transitionRef = useRef(defaultTransition);
  transitionRef.current = defaultTransition;

  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const deck = new Reveal(el, {
      embedded: false,
      hash: false,
      width: 960,
      height: 540,
      margin: 0,
      transition: transitionRef.current ?? 'slide',
      slideNumber: 'c/t',
    });
    let disposed = false;
    void deck.initialize().then(() => {
      if (disposed) return;
      revealRef.current = deck;
      if (printPdf) {
        // Give reveal a tick to apply its print layout before the dialog.
        setTimeout(() => window.print(), 400);
      }
    });
    return () => {
      disposed = true;
      try {
        deck.destroy();
      } catch {
        // reveal throws if destroyed before initialize resolves; ignore.
      }
      revealRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect slide add/remove/reorder into the running deck.
  useEffect(() => {
    const deck = revealRef.current;
    if (!deck) return;
    deck.sync();
    deck.layout();
  }, [slides]);

  return (
    <div className="fixed inset-0 z-[300] bg-black">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-[310] flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30 print:hidden"
        aria-label="Präsentation schließen"
        title="Schließen (Esc drückt Übersicht)"
      >
        <FiX />
      </button>
      <div className="reveal gruene-deck" ref={deckRef}>
        <div className="slides">
          {slides.map((slide) => (
            <section
              key={slide.id}
              {...(slide.transition ? { 'data-transition': slide.transition } : {})}
              {...(slide.background ? { 'data-background-color': slide.background } : {})}
            >
              <SlideSurface slide={slide} presenting />
              {slide.notes.trim() !== '' && <aside className="notes">{slide.notes}</aside>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
