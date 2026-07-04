import { type Slide } from '@gruenerator/contracts';
import { FiChevronDown, FiChevronUp, FiPlus, FiTrash2 } from 'react-icons/fi';

import { ScaledSlide } from './ScaledSlide.js';
import { SlideSurface } from './SlideSurface.js';

export interface SlideThumbnailListProps {
  slides: Slide[];
  activeIndex: number;
  editable: boolean;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

/**
 * Left rail: a numbered thumbnail per slide (real slide markup, scaled down)
 * with select / move / delete controls, and an "add slide" button.
 */
export function SlideThumbnailList({
  slides,
  activeIndex,
  editable,
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: SlideThumbnailListProps) {
  return (
    <div className="flex h-full w-48 min-w-48 flex-col border-r border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-900">
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {slides.map((slide, index) => (
          <div key={slide.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(index)}
              className={`block w-full overflow-hidden rounded-md border-2 transition-colors ${
                index === activeIndex
                  ? 'border-primary-600'
                  : 'border-grey-200 dark:border-grey-700 hover:border-primary-400'
              }`}
              aria-label={`Folie ${index + 1}`}
            >
              <ScaledSlide>
                <SlideSurface slide={slide} />
              </ScaledSlide>
            </button>
            <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-[10px] font-medium text-white">
              {index + 1}
            </span>
            {editable && (
              <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onMove(index, index - 1)}
                  disabled={index === 0}
                  className="rounded bg-white/90 p-0.5 text-grey-700 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 dark:text-grey-200"
                  aria-label="Nach oben"
                  title="Nach oben"
                >
                  <FiChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, index + 1)}
                  disabled={index === slides.length - 1}
                  className="rounded bg-white/90 p-0.5 text-grey-700 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 dark:text-grey-200"
                  aria-label="Nach unten"
                  title="Nach unten"
                >
                  <FiChevronDown size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(index)}
                  disabled={slides.length <= 1}
                  className="rounded bg-white/90 p-0.5 text-red-600 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90"
                  aria-label="Folie löschen"
                  title="Folie löschen"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <button
          type="button"
          onClick={onAdd}
          className="m-2 flex items-center justify-center gap-1 rounded-md border border-dashed border-grey-300 dark:border-grey-600 py-2 text-sm text-grey-600 dark:text-grey-300 hover:border-primary-500 hover:text-primary-600"
        >
          <FiPlus size={14} /> Folie
        </button>
      )}
    </div>
  );
}
