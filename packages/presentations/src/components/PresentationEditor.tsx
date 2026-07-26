import { type Slide } from '@gruenerator/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiEdit3,
  FiGrid,
} from 'react-icons/fi';
import * as Y from 'yjs';

import { useSlides } from '../collab/useSlides.js';
import { buildBlankDeckSlides } from '../lib/blankDeck.js';
import { useEditorShortcuts } from '../lib/useEditorShortcuts.js';
import { useIsMobile } from '../lib/useIsMobile.js';
import { useSwipeNavigation } from '../lib/useSwipeNavigation.js';

import { MobileSheet } from './MobileSheet.js';
import { ScaledSlide } from './ScaledSlide.js';
import { SlideDesignPanel } from './SlideDesignPanel.js';
import { SlideSurface } from './SlideSurface.js';
import { SlideTextSheet } from './SlideTextSheet.js';
import { SlideThumbnailList } from './SlideThumbnailList.js';

import './theme/gruene-deck.css';

export interface PresentationEditorApi {
  undo: () => void;
  redo: () => void;
}

export interface PresentationEditorProps {
  ydoc: Y.Doc;
  editable: boolean;
  /** Whether the "Gestalten" design panel is open (controlled by the top bar). */
  designPanelOpen?: boolean;
  onCloseDesignPanel?: () => void;
  /** Receives undo/redo so the page's top bar can drive them. */
  onReady?: (api: PresentationEditorApi) => void;
  /** Slides to seed a fresh deck with (a template picked at creation). Falls
   * back to the blank two-slide deck. Ignored once the deck is seeded. */
  seedSlides?: Slide[] | null;
  /** Suspends the editor's global keyboard shortcuts while another surface
   * (present mode) is layered on top and owns the keys. */
  shortcutsDisabled?: boolean;
  /** Profile locale of the current user ('de-DE' | 'de-AT'); writes the deck's
   * country brand once on first editable open. Pass null for guests. */
  userLocale?: string | null;
}

/**
 * Deck editor: slide-thumbnail rail + a live, inline-editable slide canvas with
 * a slide-position nav header and collapsible speaker notes, plus the optional
 * "Gestalten" design panel. The canvas is a static themed surface
 * (`SlideSurface`), never a running reveal.js instance — that only appears in
 * present mode.
 *
 * On a phone the same pieces restack: the rail becomes a filmstrip under the
 * canvas (plus a full-screen grid for reordering), the design panel becomes a
 * bottom sheet, and text is edited in a focus sheet rather than in place.
 */
export function PresentationEditor({
  ydoc,
  editable,
  designPanelOpen,
  onCloseDesignPanel,
  onReady,
  seedSlides,
  shortcutsDisabled,
  userLocale,
}: PresentationEditorProps) {
  const {
    slides,
    deckOptions,
    addSlide,
    updateSlide,
    deleteSlide,
    moveSlide,
    setDeckOption,
    seedIfNeeded,
    ensureBrand,
    undo,
    redo,
  } = useSlides(ydoc);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const isMobile = useIsMobile();
  const [gridOpen, setGridOpen] = useState(false);
  const [textField, setTextField] = useState<'title' | 'body' | null>(null);

  // Captured once — the seed only applies on first open, so a changing prop
  // identity must not reseed.
  const seedSlidesRef = useRef(seedSlides);
  useEffect(() => {
    if (!editable) return;
    seedIfNeeded(seedSlidesRef.current ?? buildBlankDeckSlides());
    // Country brand: written on first editable open (fresh AND legacy decks).
    ensureBrand(userLocale);
  }, [editable, seedIfNeeded, ensureBrand, userLocale]);

  useEffect(() => {
    if (activeIndex >= slides.length && slides.length > 0) setActiveIndex(slides.length - 1);
  }, [slides.length, activeIndex]);

  // Leaving mobile must not strand a mobile-only surface on screen.
  useEffect(() => {
    if (!isMobile) {
      setGridOpen(false);
      setTextField(null);
    }
  }, [isMobile]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.({ undo, redo });
  }, [undo, redo]);

  useEditorShortcuts({
    disabled: shortcutsDisabled || gridOpen || textField !== null,
    editable,
    slideCount: slides.length,
    activeIndex,
    onSelect: setActiveIndex,
    onUndo: undo,
    onRedo: redo,
  });

  const handleAdd = () => {
    const at = activeIndex + 1;
    addSlide({ layout: 'content', title: '', body: '' }, at);
    setActiveIndex(at);
  };

  const handleDelete = (index: number) => {
    deleteSlide(index);
    setActiveIndex((i) => Math.max(0, i >= index ? i - 1 : i));
  };

  const handleMove = (from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    moveSlide(from, to);
    setActiveIndex(to);
  };

  const goTo = (index: number) => setActiveIndex(Math.min(Math.max(index, 0), slides.length - 1));

  const swipe = useSwipeNavigation(
    () => goTo(activeIndex - 1),
    () => goTo(activeIndex + 1),
    isMobile && slides.length > 1
  );

  const active: Slide | undefined = slides[activeIndex];
  const notesPreview = active?.notes.trim()
    ? active.notes.trim()
    : 'Noch keine Notizen für diese Folie – klicken zum Hinzufügen';

  const thumbnailProps = {
    slides,
    activeIndex,
    editable,
    accent: deckOptions.accentColor,
    brand: deckOptions.brand,
    showLogo: deckOptions.showLogo,
    onSelect: setActiveIndex,
    onAdd: handleAdd,
    onDelete: handleDelete,
    onMove: handleMove,
  };

  return (
    <div
      className={`flex h-full min-h-0 bg-[#EFF3F0] dark:bg-grey-950 ${isMobile ? 'flex-col' : ''}`}
    >
      {!isMobile && <SlideThumbnailList {...thumbnailProps} orientation="vertical" />}

      <div
        className={`flex flex-1 min-h-0 flex-col items-center overflow-y-auto pb-4 ${
          isMobile ? 'px-3 pt-3' : 'px-8 pt-5'
        }`}
      >
        {active ? (
          <>
            {/* Slide-position nav header */}
            <div className="flex w-full max-w-[920px] items-center gap-2.5 pb-3">
              <div className="text-[13px] font-bold text-[#6E7E74] dark:text-grey-400">
                Folie {activeIndex + 1} von {slides.length}
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => goTo(activeIndex - 1)}
                disabled={activeIndex === 0}
                aria-label="Vorherige Folie"
                title="Vorherige Folie (←)"
                className={`flex items-center justify-center rounded-full border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 text-[#4A5A51] dark:text-grey-300 hover:bg-[#F4F7F5] dark:hover:bg-grey-700 disabled:opacity-40 ${
                  isMobile ? 'h-11 w-11' : 'h-8 w-8'
                }`}
              >
                <FiChevronLeft size={isMobile ? 18 : 14} />
              </button>
              <button
                type="button"
                onClick={() => goTo(activeIndex + 1)}
                disabled={activeIndex === slides.length - 1}
                aria-label="Nächste Folie"
                title="Nächste Folie (→)"
                className={`flex items-center justify-center rounded-full border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 text-[#4A5A51] dark:text-grey-300 hover:bg-[#F4F7F5] dark:hover:bg-grey-700 disabled:opacity-40 ${
                  isMobile ? 'h-11 w-11' : 'h-8 w-8'
                }`}
              >
                <FiChevronRight size={isMobile ? 18 : 14} />
              </button>
            </div>

            {/* Slide */}
            <div
              className="w-full max-w-[920px] flex-none overflow-hidden rounded-[14px] shadow-[0_8px_28px_rgba(27,42,34,0.14)]"
              {...(isMobile ? swipe : {})}
            >
              <ScaledSlide>
                <SlideSurface
                  slide={active}
                  accent={deckOptions.accentColor}
                  brand={deckOptions.brand}
                  showLogo={deckOptions.showLogo}
                  editable={editable}
                  ydoc={ydoc}
                  onChange={(patch) => updateSlide(activeIndex, patch)}
                  onRequestEdit={isMobile ? (field) => setTextField(field) : undefined}
                />
              </ScaledSlide>
            </div>

            {/* Collapsible speaker notes */}
            <div className="w-full max-w-[920px] pt-3.5">
              {notesOpen ? (
                <div className="overflow-hidden rounded-[10px] border border-[#E2E8E4] dark:border-grey-700 bg-white dark:bg-grey-900">
                  <button
                    type="button"
                    onClick={() => setNotesOpen(false)}
                    className="flex w-full items-center gap-2.5 border-none bg-transparent px-4 py-[11px] text-left text-[13.5px]"
                  >
                    <FiEdit3 size={15} className="text-primary-500" />
                    <span className="font-bold text-[#2F4238] dark:text-grey-200">
                      Sprechernotizen
                    </span>
                    <span className="flex-1 text-xs text-[#6E7E74] dark:text-grey-400 max-md:hidden">
                      Nur für dich sichtbar – erscheint in der Referent*innenansicht
                    </span>
                    <FiChevronUp size={14} className="text-[#6E7E74]" />
                  </button>
                  <textarea
                    value={active.notes}
                    onChange={(e) => updateSlide(activeIndex, { notes: e.target.value })}
                    placeholder="Was möchtest du zu dieser Folie sagen?"
                    disabled={!editable}
                    // text-base on mobile: below 16px iOS Safari zooms on focus.
                    className="min-h-[88px] w-full resize-y border-none border-t border-[#EFF3F0] dark:border-grey-700 bg-white dark:bg-grey-900 px-4 py-3 text-sm max-md:text-base leading-[1.55] text-[#1B2A22] dark:text-grey-100"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[#E2E8E4] dark:border-grey-700 bg-white dark:bg-grey-900 px-4 py-[11px] max-md:py-3 text-left text-[13.5px] text-[#6E7E74] dark:text-grey-400 hover:bg-[#F4F7F5] dark:hover:bg-grey-800"
                >
                  <FiEdit3 size={15} className="text-primary-500" />
                  <span className="font-bold text-[#2F4238] dark:text-grey-200">
                    Sprechernotizen
                  </span>
                  <span className="flex-1 truncate">{notesPreview}</span>
                  <FiChevronDown size={14} className="text-[#6E7E74]" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-grey-500">
            Präsentation wird geladen…
          </div>
        )}
      </div>

      {/* Mobile filmstrip: always-visible slide navigation, with a grid button
          for jumping and bulk reordering. */}
      {isMobile && (
        <div className="flex flex-none items-stretch border-t border-[#E2E8E4] bg-[#EFF3F0] dark:border-grey-700 dark:bg-grey-900">
          <button
            type="button"
            onClick={() => setGridOpen(true)}
            aria-label="Alle Folien anzeigen"
            title="Alle Folien"
            className="flex w-14 flex-none flex-col items-center justify-center gap-1 border-r border-[#E2E8E4] text-[10px] font-bold text-[#4A5A51] dark:border-grey-700 dark:text-grey-300"
          >
            <FiGrid size={18} />
            Alle
          </button>
          <div className="min-w-0 flex-1">
            <SlideThumbnailList {...thumbnailProps} orientation="horizontal" />
          </div>
        </div>
      )}

      {!isMobile && designPanelOpen && editable && active && (
        <SlideDesignPanel
          slide={active}
          onUpdateSlide={(patch) => updateSlide(activeIndex, patch)}
          deckOptions={deckOptions}
          onDeckOption={setDeckOption}
          onClose={() => onCloseDesignPanel?.()}
        />
      )}

      {isMobile && designPanelOpen && editable && active && (
        <MobileSheet title="Folie gestalten" onClose={() => onCloseDesignPanel?.()}>
          <SlideDesignPanel
            slide={active}
            onUpdateSlide={(patch) => updateSlide(activeIndex, patch)}
            deckOptions={deckOptions}
            onDeckOption={setDeckOption}
            onClose={() => onCloseDesignPanel?.()}
            variant="sheet"
          />
        </MobileSheet>
      )}

      {isMobile && gridOpen && (
        <MobileSheet title="Alle Folien" size="full" onClose={() => setGridOpen(false)}>
          <p className="pb-3 text-xs text-[#6E7E74] dark:text-grey-400">
            Tippen zum Öffnen, gedrückt halten zum Umsortieren.
          </p>
          <SlideThumbnailList
            {...thumbnailProps}
            orientation="grid"
            onSelect={(index) => {
              setActiveIndex(index);
              setGridOpen(false);
            }}
          />
        </MobileSheet>
      )}

      {isMobile && textField && active && editable && (
        <SlideTextSheet
          slide={active}
          field={textField}
          onChange={(patch) => updateSlide(activeIndex, patch)}
          onClose={() => setTextField(null)}
        />
      )}
    </div>
  );
}
