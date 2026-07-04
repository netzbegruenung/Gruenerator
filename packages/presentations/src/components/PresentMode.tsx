import { type Slide } from '@gruenerator/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FiGrid, FiMaximize, FiMessageSquare, FiX } from 'react-icons/fi';
import Reveal from 'reveal.js';
import RevealHighlight from 'reveal.js/plugin/highlight';
import RevealMath from 'reveal.js/plugin/math';
import RevealNotes from 'reveal.js/plugin/notes';
import * as Y from 'yjs';

import { useSlides } from '../collab/useSlides.js';

import { SlideSurface } from './SlideSurface.js';

import 'reveal.js/reveal.css';
import 'reveal.js/plugin/highlight/monokai.css';
import './theme/gruene-deck.css';

export interface PresentModeProps {
  ydoc: Y.Doc;
  onClose: () => void;
  /** Reveal auto-detects `?print-pdf` in the URL; when set we also trigger the
   * browser print dialog once the deck is laid out. */
  printPdf?: boolean;
  /** Scroll view ("Lesemodus"): the deck renders as one scrollable page. */
  scroll?: boolean;
}

type RevealApi = InstanceType<typeof Reveal>;

/** Classify a background string into the matching reveal data-background-* attr. */
function backgroundAttrs(bg: string | null | undefined): Record<string, string> {
  if (!bg) return {};
  const value = bg.trim();
  // Classification kept in lockstep with SlideSurface.resolveBackground so the
  // editor canvas and the presented slide never disagree (e.g. on
  // `repeating-linear-gradient(...)`).
  if (/^(https?:|data:|\/)/.test(value)) return { 'data-background-image': value };
  if (/gradient\(/.test(value)) return { 'data-background-gradient': value };
  return { 'data-background-color': value };
}

function sectionAttrs(slide: Slide): Record<string, string> {
  const attrs: Record<string, string> = { ...backgroundAttrs(slide.background) };
  if (slide.transition) attrs['data-transition'] = slide.transition;
  if (slide.autoAnimate) attrs['data-auto-animate'] = '';
  if (slide.hidden) attrs['data-visibility'] = 'hidden';
  return attrs;
}

/**
 * Fullscreen reveal.js deck. This is the ONLY module that imports reveal.js +
 * its CSS/plugins, so the global styles never load until the user presents.
 * Uses raw reveal.js (not the 0.2.x React wrapper) for full control over
 * classNames, plugins, print-pdf, and lifecycle. Rebuilds via `sync()` when
 * slides change; applies deck options via `configure()`.
 */
export function PresentMode({ ydoc, onClose, printPdf, scroll }: PresentModeProps) {
  const { slides, deckOptions } = useSlides(ydoc);
  const deckRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<RevealApi | null>(null);
  const [overview, setOverview] = useState(false);

  const optsRef = useRef(deckOptions);
  optsRef.current = deckOptions;

  // Initialize once (re-init only when the structural `scroll` view changes).
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const opts = optsRef.current;
    const deck = new Reveal(el, {
      embedded: false,
      hash: false,
      width: 960,
      height: 540,
      margin: 0,
      transition: opts.defaultTransition ?? 'slide',
      slideNumber: opts.slideNumber ? 'c/t' : false,
      autoSlide: opts.autoSlide ?? 0,
      loop: opts.loop,
      ...(scroll ? { view: 'scroll' } : {}),
      plugins: [RevealHighlight, RevealMath.KaTeX, RevealNotes],
    });
    let disposed = false;
    void deck.initialize().then(() => {
      if (disposed) return;
      revealRef.current = deck;
      // Re-apply the latest options: the live-configure effect below may have
      // fired against a still-null ref during this async init and been lost.
      const latest = optsRef.current;
      deck.configure({
        transition: latest.defaultTransition ?? 'slide',
        slideNumber: latest.slideNumber ? 'c/t' : false,
        autoSlide: latest.autoSlide ?? 0,
        loop: latest.loop,
      });
      deck.on('overviewshown', () => setOverview(true));
      deck.on('overviewhidden', () => setOverview(false));
      if (printPdf) {
        // Give reveal a tick to apply its print layout before the dialog.
        setTimeout(() => window.print(), 500);
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
  }, [scroll]);

  // Apply deck-option changes live (no re-init needed).
  useEffect(() => {
    revealRef.current?.configure({
      transition: deckOptions.defaultTransition ?? 'slide',
      slideNumber: deckOptions.slideNumber ? 'c/t' : false,
      autoSlide: deckOptions.autoSlide ?? 0,
      loop: deckOptions.loop,
    });
  }, [deckOptions]);

  // Reflect STRUCTURAL slide changes (add / remove / reorder) into the running
  // deck. Keyed on the id signature, not `slides`, so a collaborator's
  // keystroke-level content edit doesn't trigger a full sync() that would reset
  // the presenter's position and fragment state. Content edits re-render the
  // section markup in place via React.
  const structureKey = slides.map((s) => s.id).join(',');
  useEffect(() => {
    const deck = revealRef.current;
    if (!deck) return;
    deck.sync();
    deck.layout();
  }, [structureKey]);

  const toggleOverview = useCallback(() => revealRef.current?.toggleOverview(), []);
  const toggleFullscreen = useCallback(() => {
    const el = deckRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);
  const openSpeakerView = useCallback(() => {
    const notes = revealRef.current?.getPlugin('notes') as { open?: () => void } | undefined;
    notes?.open?.();
  }, []);

  return (
    <div className="fixed inset-0 z-[300] bg-black">
      <div className="absolute right-3 top-3 z-[310] flex items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={openSpeakerView}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          aria-label="Referentenansicht"
          title="Referentenansicht (S)"
        >
          <FiMessageSquare />
        </button>
        <button
          type="button"
          onClick={toggleOverview}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/30 ${overview ? 'bg-white/40' : 'bg-white/15'}`}
          aria-label="Übersicht"
          title="Übersicht (O / Esc)"
        >
          <FiGrid />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          aria-label="Vollbild"
          title="Vollbild (F)"
        >
          <FiMaximize />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          aria-label="Präsentation schließen"
          title="Schließen"
        >
          <FiX />
        </button>
      </div>
      <div className="reveal gruene-deck" ref={deckRef}>
        <div className="slides">
          {slides.map((slide) => (
            <section key={slide.id} {...sectionAttrs(slide)}>
              <SlideSurface slide={slide} presenting />
              {slide.notes.trim() !== '' && <aside className="notes">{slide.notes}</aside>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
