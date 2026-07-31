import { type Slide } from '@gruenerator/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiGrid, FiMaximize, FiMessageSquare, FiX } from 'react-icons/fi';
import Reveal from 'reveal.js';
import RevealHighlight from 'reveal.js/plugin/highlight';
import RevealMath from 'reveal.js/plugin/math';
import RevealNotes from 'reveal.js/plugin/notes';
import * as Y from 'yjs';

import { useSlides } from '../collab/useSlides.js';
import { SLIDE_REFIT_EVENT } from '../lib/useAutoFitScale.js';

import { SlideSurface } from './SlideSurface.js';

import 'reveal.js/reveal.css';
import 'reveal.js/plugin/highlight/monokai.css';
import './theme/gruene-deck.css';
// Print-only; kept out of gruene-deck.css because PresentationEditor imports
// that file too and these rules must never reach the editor chunk.
import './theme/print-pdf.css';

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

/**
 * reveal section attributes. Backgrounds are NOT set here — SlideSurface paints
 * the (variant-aware, accent-driven) background itself, so there is a single
 * background classifier for both the editor and the presented deck.
 */
function sectionAttrs(slide: Slide): Record<string, string> {
  const attrs: Record<string, string> = {};
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
  const { slides: liveSlides, deckOptions } = useSlides(ydoc);
  const deckRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<RevealApi | null>(null);
  const [overview, setOverview] = useState(false);

  // PDF export: snapshot the deck the first time it is non-empty and render
  // that snapshot for the rest of the export. Two structural reasons:
  //   1. The export tab mounts us as soon as `ydoc` exists, and useCollaboration
  //      hands out an EMPTY Y.Doc until Hocuspocus syncs. PrintView.activate()
  //      runs exactly once and starts at `slides[0].parentNode` — against an
  //      empty `.slides` that throws, so `pdf-ready` never fires and reveal
  //      leaves the viewport on `loading-scroll-mode` (`visibility: hidden`).
  //      The 3s fallback below then prints a blank sheet.
  //   2. activate() reparents every <section> into a `div.pdf-page`. A
  //      collaborator's edit landing after that would make React reconcile
  //      against nodes whose position it no longer knows.
  const [printSlides, setPrintSlides] = useState<Slide[] | null>(null);
  useEffect(() => {
    // Latch: fires once when the deck first arrives, then settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (printPdf && !printSlides && liveSlides.length > 0) setPrintSlides(liveSlides);
  }, [printPdf, printSlides, liveSlides]);
  const slides = printPdf ? (printSlides ?? []) : liveSlides;
  /** Print must not boot reveal before the deck has arrived (see above). */
  const deckReady = !printPdf || slides.length > 0;

  const optsRef = useRef(deckOptions);
  optsRef.current = deckOptions;

  // Initialize once (re-init only when the structural `scroll` view changes).
  useEffect(() => {
    const el = deckRef.current;
    if (!el || !deckReady) return;
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
        // Open the print dialog only once BOTH signals have landed:
        //   1. reveal's print layout is complete (`pdf-ready`) — a fixed timer
        //      could beat it on a non-trivial deck and capture a half-laid-out
        //      PDF;
        //   2. the webfonts are loaded — auto-fit (useAutoFitScale) measures at
        //      mount against the fallback metrics and re-fits on `fonts.ready`,
        //      and the CI faces (GrueneType Neue / Gotham Narrow) are metrically
        //      far from the fallbacks, so printing earlier can bake a type scale
        //      one ladder step off into the PDF.
        // Two frames of slack then let that rAF-scheduled re-fit paint. The
        // fallback timer still fires the dialog if a signal never arrives (a
        // load-race), and `printed` dedups so we never print twice.
        let printed = false;
        const doPrint = () => {
          if (printed) return;
          printed = true;
          // Last-chance re-fit — synchronous, so print() below reads the
          // freshly written --gs-font-scale. Idempotent (the ladder walk
          // converges), and the only re-fit on the fallback path, where
          // `pdf-ready` never arrived.
          window.dispatchEvent(new Event(SLIDE_REFIT_EVENT));
          window.print();
        };
        void Promise.all([
          new Promise<void>((resolve) => deck.on('pdf-ready', () => resolve())),
          document.fonts?.ready ?? Promise.resolve(),
        ]).then(() => {
          // First moment every slide can measure: PrintView has wrapped each
          // section in a `.pdf-page` and forced them all visible, and the CI
          // faces are loaded. Before this, slides 2..N measure 0 and keep
          // scale 1 — `.gruene-slide` then clips them without a trace.
          window.dispatchEvent(new Event(SLIDE_REFIT_EVENT));
          requestAnimationFrame(() => requestAnimationFrame(doPrint));
        });
        // Only reached when a signal is lost; the happy path resolves well
        // inside this, so the longer deadline costs nothing in normal exports.
        setTimeout(doPrint, 3000);
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
    // `deckReady` only ever flips false→true, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll, deckReady]);

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
    // Print renders a frozen snapshot; a sync() after PrintView has reparented
    // the sections into `.pdf-page` wrappers would corrupt the layout.
    if (!deck || printPdf) return;
    deck.sync();
    deck.layout();
  }, [structureKey, printPdf]);

  // ESC exits present mode. reveal binds ESC (and O) to toggleOverview, so
  // without this ESC could only ever open/close the overview, never close the
  // deck. The capture-phase listener runs before reveal's handler: on a slide
  // we exit; in overview we let reveal close the overview first (next ESC exits).
  useEffect(() => {
    // Not in the export tab: the app shell is hidden for print, so unmounting
    // the deck would leave a blank page behind.
    if (printPdf) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || overview) return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [overview, onClose, printPdf]);

  // Keep the screen awake while presenting. Best-effort: the API is missing on
  // iOS Safari and the lock is dropped whenever the tab is backgrounded, so it
  // is re-acquired on visibility change.
  useEffect(() => {
    if (printPdf) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      void nav.wakeLock
        ?.request('screen')
        .then((s) => {
          if (cancelled) void s.release();
          else sentinel = s;
        })
        .catch(() => {
          /* denied (battery saver, no user gesture) — presenting still works */
        });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void sentinel?.release().catch(() => {});
    };
  }, [printPdf]);

  // Auto-hide the toolbar on touch so it stops covering the slide; any tap or
  // slide change brings it back. Never hides for mouse users.
  const [chromeVisible, setChromeVisible] = useState(true);
  useEffect(() => {
    if (printPdf) return;
    if (!window.matchMedia('(hover: none)').matches) return;
    const el = deckRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      setChromeVisible(true);
      timer = setTimeout(() => setChromeVisible(false), 3000);
    };
    schedule();
    el.addEventListener('pointerdown', schedule);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('pointerdown', schedule);
    };
  }, [printPdf]);

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

  const deck = (
    <div className={`reveal gruene-deck${printPdf ? ' gruene-print-root' : ''}`} ref={deckRef}>
      <div className="slides">
        {slides.map((slide) => (
          <section key={slide.id} {...sectionAttrs(slide)}>
            <SlideSurface
              slide={slide}
              accent={deckOptions.accentColor}
              brand={deckOptions.brand}
              showLogo={deckOptions.showLogo}
              presenting
            />
            {slide.notes.trim() !== '' && <aside className="notes">{slide.notes}</aside>}
          </section>
        ))}
      </div>
    </div>
  );

  // PDF export: the deck must be a direct child of <body> and statically
  // positioned. reveal paginates by putting `page-break-after: always` on the
  // `.pdf-page` wrappers it injects, and Blink ignores fragmentation inside a
  // `position: fixed` subtree — it prints the first page only, clipped to the
  // viewport. That is the "only the first slide" bug.
  //
  // Portalling (rather than un-fixing the wrapper in CSS) also lets
  // print-pdf.css remove the whole app shell with one rule, and drops the
  // `bg-black` that would otherwise sit behind every page. The toolbar is not
  // rendered at all: `print:hidden` kept it off paper, but it still floated
  // over the on-screen stack in the export tab.
  if (printPdf) return createPortal(deck, document.body);

  return (
    <div className="fixed inset-0 z-[300] bg-black">
      <div
        className={`absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[310] flex items-center gap-2 transition-opacity duration-300 motion-reduce:transition-none print:hidden ${
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={openSpeakerView}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          aria-label="Referentenansicht"
          title="Referentenansicht (S)"
        >
          <FiMessageSquare />
        </button>
        <button
          type="button"
          onClick={toggleOverview}
          className={`flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/30 ${overview ? 'bg-white/40' : 'bg-white/15'}`}
          aria-label="Übersicht"
          title="Übersicht (O / Esc)"
        >
          <FiGrid />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          aria-label="Vollbild"
          title="Vollbild (F)"
        >
          <FiMaximize />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
          aria-label="Präsentation schließen"
          title="Schließen"
        >
          <FiX />
        </button>
      </div>
      {deck}
    </div>
  );
}
