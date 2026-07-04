import { type Slide } from '@gruenerator/contracts';
import { useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiChevronUp, FiEdit3 } from 'react-icons/fi';
import * as Y from 'yjs';

import { useSlides } from '../collab/useSlides.js';
import { buildBlankDeckSlides } from '../lib/blankDeck.js';

import { ScaledSlide } from './ScaledSlide.js';
import { SlideDesignPanel } from './SlideDesignPanel.js';
import { SlideSurface } from './SlideSurface.js';
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
}

/**
 * Deck editor: slide-thumbnail rail + a live, inline-editable slide canvas with
 * a slide-position nav header and collapsible speaker notes, plus the optional
 * "Gestalten" design panel. The canvas is a static themed surface
 * (`SlideSurface`), never a running reveal.js instance — that only appears in
 * present mode.
 */
export function PresentationEditor({
  ydoc,
  editable,
  designPanelOpen,
  onCloseDesignPanel,
  onReady,
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
    undo,
    redo,
  } = useSlides(ydoc);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (editable) seedIfNeeded(buildBlankDeckSlides());
  }, [editable, seedIfNeeded]);

  useEffect(() => {
    if (activeIndex >= slides.length && slides.length > 0) setActiveIndex(slides.length - 1);
  }, [slides.length, activeIndex]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    onReadyRef.current?.({ undo, redo });
  }, [undo, redo]);

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

  const active: Slide | undefined = slides[activeIndex];
  const notesPreview = active?.notes.trim()
    ? active.notes.trim()
    : 'Noch keine Notizen für diese Folie – klicken zum Hinzufügen';

  return (
    <div className="flex h-full min-h-0 bg-[#EFF3F0] dark:bg-grey-950">
      <SlideThumbnailList
        slides={slides}
        activeIndex={activeIndex}
        editable={editable}
        accent={deckOptions.accentColor}
        onSelect={setActiveIndex}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onMove={handleMove}
      />

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-8 pb-4 pt-5">
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
                title="Vorherige Folie"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 text-[#4A5A51] dark:text-grey-300 hover:bg-[#F4F7F5] dark:hover:bg-grey-700 disabled:opacity-40"
              >
                <FiChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => goTo(activeIndex + 1)}
                disabled={activeIndex === slides.length - 1}
                aria-label="Nächste Folie"
                title="Nächste Folie"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#D4DDD7] dark:border-grey-600 bg-white dark:bg-grey-800 text-[#4A5A51] dark:text-grey-300 hover:bg-[#F4F7F5] dark:hover:bg-grey-700 disabled:opacity-40"
              >
                <FiChevronRight size={14} />
              </button>
            </div>

            {/* Slide */}
            <div className="w-full max-w-[920px] flex-none overflow-hidden rounded-[14px] shadow-[0_8px_28px_rgba(27,42,34,0.14)]">
              <ScaledSlide>
                <SlideSurface
                  slide={active}
                  accent={deckOptions.accentColor}
                  editable={editable}
                  onChange={(patch) => updateSlide(activeIndex, patch)}
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
                    <span className="flex-1 text-xs text-[#6E7E74] dark:text-grey-400">
                      Nur für dich sichtbar – erscheint in der Referent*innenansicht
                    </span>
                    <FiChevronUp size={14} className="text-[#6E7E74]" />
                  </button>
                  <textarea
                    value={active.notes}
                    onChange={(e) => updateSlide(activeIndex, { notes: e.target.value })}
                    placeholder="Was möchtest du zu dieser Folie sagen?"
                    disabled={!editable}
                    className="min-h-[88px] w-full resize-y border-none border-t border-[#EFF3F0] dark:border-grey-700 bg-white dark:bg-grey-900 px-4 py-3 text-sm leading-[1.55] text-[#1B2A22] dark:text-grey-100"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] border border-[#E2E8E4] dark:border-grey-700 bg-white dark:bg-grey-900 px-4 py-[11px] text-left text-[13.5px] text-[#6E7E74] dark:text-grey-400 hover:bg-[#F4F7F5] dark:hover:bg-grey-800"
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

      {designPanelOpen && editable && active && (
        <SlideDesignPanel
          slide={active}
          onUpdateSlide={(patch) => updateSlide(activeIndex, patch)}
          deckOptions={deckOptions}
          onDeckOption={setDeckOption}
          onClose={() => onCloseDesignPanel?.()}
        />
      )}
    </div>
  );
}
