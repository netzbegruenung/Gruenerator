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
 * Left rail: a card per slide (real slide markup scaled down as a preview, plus
 * a number badge + label row) with select / move / delete controls, and a
 * dashed "Neue Folie" button. Matches the Präsentations-Editor design.
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
    <div className="flex h-full w-[190px] min-w-[190px] flex-col gap-3 overflow-y-auto border-r border-[#E2E8E4] dark:border-grey-700 bg-[#EFF3F0] dark:bg-grey-900 p-[14px]">
      {slides.map((slide, index) => {
        const active = index === activeIndex;
        return (
          <div key={slide.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-label={`Folie ${index + 1}`}
              className={`block w-full overflow-hidden rounded-[10px] bg-white dark:bg-grey-800 text-left transition-transform hover:-translate-y-px ${
                active
                  ? 'shadow-[0_0_0_2.5px_var(--primary-600,#316049),0_4px_12px_rgba(27,42,34,0.12)]'
                  : 'shadow-[0_1px_4px_rgba(27,42,34,0.08)]'
              }`}
            >
              <div className="pointer-events-none">
                <ScaledSlide>
                  <SlideSurface slide={slide} />
                </ScaledSlide>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-[7px]">
                <span
                  className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md text-[10.5px] font-bold ${
                    active
                      ? 'bg-primary-600 text-white'
                      : 'bg-[#E4EBE7] dark:bg-grey-700 text-[#6E7E74] dark:text-grey-300'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="truncate text-[11px] font-bold text-[#42544A] dark:text-grey-300">
                  {slide.title || `Folie ${index + 1}`}
                </span>
              </div>
            </button>

            {editable && (
              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onMove(index, index - 1)}
                  disabled={index === 0}
                  className="rounded bg-white/95 p-0.5 text-grey-700 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 dark:text-grey-200"
                  aria-label="Nach oben"
                  title="Nach oben"
                >
                  <FiChevronUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, index + 1)}
                  disabled={index === slides.length - 1}
                  className="rounded bg-white/95 p-0.5 text-grey-700 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 dark:text-grey-200"
                  aria-label="Nach unten"
                  title="Nach unten"
                >
                  <FiChevronDown size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(index)}
                  disabled={slides.length <= 1}
                  className="rounded bg-white/95 p-0.5 text-red-600 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90"
                  aria-label="Folie löschen"
                  title="Folie löschen"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editable && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center justify-center gap-[7px] rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] py-2.5 text-[13px] font-bold text-primary-500 hover:border-primary-500 hover:bg-[#E4EBE7] dark:hover:bg-grey-800"
        >
          <FiPlus size={13} strokeWidth={2.5} /> Neue Folie
        </button>
      )}
    </div>
  );
}
