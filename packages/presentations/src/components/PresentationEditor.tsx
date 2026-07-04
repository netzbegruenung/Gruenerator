import { type Slide, type SlideLayout } from '@gruenerator/contracts';
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
};

/**
 * Deck editor: slide-thumbnail rail + a live, inline-editable slide canvas.
 * The canvas is a static themed surface (`SlideSurface`), never a running
 * reveal.js instance — that only appears in present mode.
 */
export function PresentationEditor({ ydoc, editable, onReady }: PresentationEditorProps) {
  const { slides, addSlide, updateSlide, deleteSlide, moveSlide, seedIfNeeded, undo, redo } =
    useSlides(ydoc);
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
              <div className="flex items-center gap-2">
                <label className="text-sm text-grey-600 dark:text-grey-300">Layout</label>
                <select
                  value={active.layout}
                  onChange={(e) =>
                    updateSlide(activeIndex, { layout: e.target.value as SlideLayout })
                  }
                  className="rounded-md border border-grey-300 dark:border-grey-600 bg-background px-2 py-1 text-sm"
                >
                  {(Object.keys(LAYOUT_LABELS) as SlideLayout[]).map((layout) => (
                    <option key={layout} value={layout}>
                      {LAYOUT_LABELS[layout]}
                    </option>
                  ))}
                </select>
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
