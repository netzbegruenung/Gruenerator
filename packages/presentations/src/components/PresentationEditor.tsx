import { type Slide, type SlideLayout, type SlideTransition } from '@gruenerator/contracts';
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';

import { buildBlankDeckSlides } from '../lib/blankDeck.js';
import { useSlides } from '../collab/useSlides.js';

import { ScaledSlide } from './ScaledSlide.js';
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
  /** Receives undo/redo so the page's top bar can drive them. */
  onReady?: (api: PresentationEditorApi) => void;
}

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: 'Titel',
  content: 'Inhalt',
  split: 'Zweispaltig',
  quote: 'Zitat',
  image: 'Bild',
  code: 'Code',
};

const TRANSITION_LABELS: Record<SlideTransition, string> = {
  none: 'Keine',
  fade: 'Überblenden',
  slide: 'Schieben',
  convex: 'Konvex',
  concave: 'Konkav',
  zoom: 'Zoom',
};
const TRANSITIONS = Object.keys(TRANSITION_LABELS) as SlideTransition[];

const selectClass =
  'rounded-md border border-grey-300 dark:border-grey-600 bg-background px-2 py-1 text-sm';
const checkboxLabelClass =
  'flex items-center gap-1.5 text-sm text-grey-600 dark:text-grey-300 cursor-pointer';

/**
 * Deck editor: slide-thumbnail rail + a live, inline-editable slide canvas.
 * The canvas is a static themed surface (`SlideSurface`), never a running
 * reveal.js instance — that only appears in present mode.
 */
export function PresentationEditor({ ydoc, editable, onReady }: PresentationEditorProps) {
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

  const active: Slide | undefined = slides[activeIndex];

  return (
    <div className="flex h-full min-h-0">
      <SlideThumbnailList
        slides={slides}
        activeIndex={activeIndex}
        editable={editable}
        onSelect={setActiveIndex}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onMove={handleMove}
      />

      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-grey-100 dark:bg-grey-950 p-6">
        {active ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {editable && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-grey-600 dark:text-grey-300">Layout</label>
                  <select
                    value={active.layout}
                    onChange={(e) =>
                      updateSlide(activeIndex, { layout: e.target.value as SlideLayout })
                    }
                    className={selectClass}
                  >
                    {(Object.keys(LAYOUT_LABELS) as SlideLayout[]).map((layout) => (
                      <option key={layout} value={layout}>
                        {LAYOUT_LABELS[layout]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-grey-600 dark:text-grey-300">Übergang</label>
                  <select
                    value={active.transition ?? ''}
                    onChange={(e) =>
                      updateSlide(activeIndex, {
                        transition: e.target.value ? (e.target.value as SlideTransition) : null,
                      })
                    }
                    className={selectClass}
                  >
                    <option value="">Standard</option>
                    {TRANSITIONS.map((t) => (
                      <option key={t} value={t}>
                        {TRANSITION_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                {active.layout === 'code' && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-grey-600 dark:text-grey-300">Sprache</label>
                    <input
                      value={active.codeLanguage ?? ''}
                      placeholder="z.B. typescript"
                      onChange={(e) =>
                        updateSlide(activeIndex, { codeLanguage: e.target.value || null })
                      }
                      className={`${selectClass} w-32`}
                    />
                  </div>
                )}

                <label className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={active.fragments ?? false}
                    onChange={(e) => updateSlide(activeIndex, { fragments: e.target.checked })}
                  />
                  Schrittweise
                </label>
                <label className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={active.autoAnimate ?? false}
                    onChange={(e) => updateSlide(activeIndex, { autoAnimate: e.target.checked })}
                  />
                  Auto-Animate
                </label>
                <label className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={active.hidden ?? false}
                    onChange={(e) => updateSlide(activeIndex, { hidden: e.target.checked })}
                  />
                  Ausblenden
                </label>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-grey-600 dark:text-grey-300">Hintergrund</label>
                  <input
                    value={active.background ?? ''}
                    placeholder="Farbe / Bild-URL"
                    onChange={(e) =>
                      updateSlide(activeIndex, { background: e.target.value || null })
                    }
                    className={`${selectClass} w-40`}
                  />
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg shadow-lg">
              <ScaledSlide>
                <SlideSurface
                  slide={active}
                  editable={editable}
                  onChange={(patch) => updateSlide(activeIndex, patch)}
                />
              </ScaledSlide>
            </div>

            {editable && (
              <div className="flex flex-col gap-1">
                <label className="text-sm text-grey-600 dark:text-grey-300">Sprechernotizen</label>
                <textarea
                  value={active.notes}
                  placeholder="Notizen für die Referent*in (nur in der Referentenansicht sichtbar)"
                  onChange={(e) => updateSlide(activeIndex, { notes: e.target.value })}
                  rows={3}
                  className="resize-y rounded-md border border-grey-300 dark:border-grey-600 bg-background px-3 py-2 text-sm"
                />
              </div>
            )}

            {editable && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-grey-200 dark:border-grey-700 pt-3">
                <span className="text-xs font-medium uppercase tracking-wide text-grey-500">
                  Präsentation
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-grey-600 dark:text-grey-300">Übergang</label>
                  <select
                    value={deckOptions.defaultTransition ?? 'slide'}
                    onChange={(e) =>
                      setDeckOption({ defaultTransition: e.target.value as SlideTransition })
                    }
                    className={selectClass}
                  >
                    {TRANSITIONS.map((t) => (
                      <option key={t} value={t}>
                        {TRANSITION_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <label className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={deckOptions.slideNumber}
                    onChange={(e) => setDeckOption({ slideNumber: e.target.checked })}
                  />
                  Foliennummern
                </label>
                <label className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={deckOptions.loop}
                    onChange={(e) => setDeckOption({ loop: e.target.checked })}
                  />
                  Endlosschleife
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-grey-600 dark:text-grey-300">
                    Auto-Weiter (Sek.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={deckOptions.autoSlide ? Math.round(deckOptions.autoSlide / 1000) : 0}
                    onChange={(e) => {
                      const secs = Number(e.target.value);
                      setDeckOption({ autoSlide: secs > 0 ? secs * 1000 : null });
                    }}
                    className={`${selectClass} w-20`}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-grey-500">
            Präsentation wird geladen…
          </div>
        )}
      </div>
    </div>
  );
}
