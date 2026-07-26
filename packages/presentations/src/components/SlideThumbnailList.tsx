import { type Slide } from '@gruenerator/contracts';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiMoreVertical, FiPlus, FiTrash2 } from 'react-icons/fi';

import { ScaledSlide } from './ScaledSlide.js';
import { SlideSurface } from './SlideSurface.js';

/**
 * `vertical` is the desktop rail, `horizontal` the mobile filmstrip under the
 * canvas, `grid` the full-screen mobile slide overview.
 */
export type ThumbnailOrientation = 'vertical' | 'horizontal' | 'grid';

export interface SlideThumbnailListProps {
  slides: Slide[];
  activeIndex: number;
  editable: boolean;
  /** Deck brand accent, forwarded to each thumbnail's SlideSurface. */
  accent?: string | null;
  /** Country CI + logo toggle, forwarded to each thumbnail's SlideSurface. */
  brand?: string | null;
  showLogo?: boolean;
  orientation?: ThumbnailOrientation;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

interface SortableSlideCardProps {
  slide: Slide;
  index: number;
  active: boolean;
  editable: boolean;
  accent?: string | null;
  brand?: string | null;
  showLogo?: boolean;
  slideCount: number;
  orientation: ThumbnailOrientation;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
}

function SortableSlideCard({
  slide,
  index,
  active,
  editable,
  accent,
  brand,
  showLogo,
  slideCount,
  orientation,
  onSelect,
  onDelete,
  onMove,
}: SortableSlideCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
    disabled: !editable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };

  // In the touch layouts the grip icon would be far below a 44px target, so the
  // whole card becomes the drag handle instead: the TouchSensor's 200ms delay
  // keeps a plain tap working as "select".
  const dragWholeCard = editable && orientation !== 'vertical';

  // Keep the selected slide visible when the filmstrip is longer than the
  // screen and selection changed from elsewhere (swipe, nav arrows, delete).
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || orientation !== 'horizontal') return;
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active, orientation]);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        cardRef.current = node;
      }}
      style={style}
      className={`group relative ${orientation === 'horizontal' ? 'w-[132px] flex-none snap-start' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        aria-label={`Folie ${index + 1}`}
        aria-current={active ? 'true' : undefined}
        {...(dragWholeCard ? attributes : {})}
        {...(dragWholeCard ? listeners : {})}
        className={`block w-full touch-none overflow-hidden rounded-[10px] bg-white dark:bg-grey-800 text-left transition-transform hover:-translate-y-px ${
          active
            ? 'shadow-[0_0_0_2.5px_var(--primary-600,#316049),0_4px_12px_rgba(27,42,34,0.12)]'
            : 'shadow-[0_1px_4px_rgba(27,42,34,0.08)]'
        }`}
      >
        <div className="pointer-events-none">
          <ScaledSlide>
            <SlideSurface slide={slide} accent={accent} brand={brand} showLogo={showLogo} />
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

      {/* The filmstrip card is too small to host controls — reordering and
          deleting happen in the grid overview instead. */}
      {editable && orientation !== 'horizontal' && (
        <div
          className={`absolute right-1.5 top-1.5 flex gap-0.5 transition-opacity ${
            orientation === 'grid'
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100'
          }`}
        >
          {orientation === 'vertical' && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none rounded bg-white/95 p-0.5 text-grey-700 shadow-sm hover:bg-white active:cursor-grabbing dark:bg-grey-800/90 dark:text-grey-200 max-md:p-2"
              aria-label="Folie ziehen zum Umsortieren"
              title="Ziehen zum Umsortieren"
            >
              <FiMoreVertical size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="rounded bg-white/95 p-0.5 text-grey-700 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 dark:text-grey-200 max-md:p-2"
            aria-label="Nach vorne"
            title="Nach vorne"
          >
            <FiChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, index + 1)}
            disabled={index === slideCount - 1}
            className="rounded bg-white/95 p-0.5 text-grey-700 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 dark:text-grey-200 max-md:p-2"
            aria-label="Nach hinten"
            title="Nach hinten"
          >
            <FiChevronDown size={12} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(index)}
            disabled={slideCount <= 1}
            className="rounded bg-white/95 p-0.5 text-red-600 shadow-sm hover:bg-white disabled:opacity-40 dark:bg-grey-800/90 max-md:p-2"
            aria-label="Folie löschen"
            title="Folie löschen"
          >
            <FiTrash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

const CONTAINER_CLASS: Record<ThumbnailOrientation, string> = {
  vertical:
    'flex h-full w-[190px] min-w-[190px] flex-col gap-3 overflow-y-auto border-r border-[#E2E8E4] dark:border-grey-700 bg-[#EFF3F0] dark:bg-grey-900 p-[14px]',
  horizontal:
    'flex w-full flex-none snap-x snap-mandatory items-start gap-2.5 overflow-x-auto border-t border-[#E2E8E4] dark:border-grey-700 bg-[#EFF3F0] dark:bg-grey-900 px-3 py-2.5',
  grid: 'grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3',
};

const SORTING_STRATEGY = {
  vertical: verticalListSortingStrategy,
  horizontal: horizontalListSortingStrategy,
  grid: rectSortingStrategy,
} as const;

/**
 * Slide navigator. Renders as the desktop left rail, a horizontal filmstrip on
 * a phone, or a full-screen grid — the layout differs but selection, reordering
 * and deletion all route through the same callbacks.
 *
 * Reordering: drag a card (grip handle on desktop, long-press anywhere on
 * touch) or use the chevrons, which stay as the keyboard/click fallback.
 */
export function SlideThumbnailList({
  slides,
  activeIndex,
  editable,
  accent,
  brand,
  showLogo,
  orientation = 'vertical',
  onSelect,
  onAdd,
  onDelete,
  onMove,
}: SlideThumbnailListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Long-press to drag: a plain tap still selects, and a quick vertical drag
    // still scrolls the filmstrip/grid.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = slides.findIndex((s) => s.id === active.id);
    const to = slides.findIndex((s) => s.id === over.id);
    if (from === -1 || to === -1) return;
    onMove(from, to);
  };

  const draggingSlide = draggingId ? slides.find((s) => s.id === draggingId) : null;

  return (
    <div data-tour="presentations-slides" className={CONTAINER_CLASS[orientation]}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={slides.map((s) => s.id)} strategy={SORTING_STRATEGY[orientation]}>
          {slides.map((slide, index) => (
            <SortableSlideCard
              key={slide.id}
              slide={slide}
              index={index}
              active={index === activeIndex}
              editable={editable}
              accent={accent}
              brand={brand}
              showLogo={showLogo}
              slideCount={slides.length}
              orientation={orientation}
              onSelect={onSelect}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </SortableContext>

        {/* Without an overlay the dragged card is clipped by the scroll
            container in the filmstrip and grid layouts. */}
        <DragOverlay>
          {draggingSlide ? (
            <div className="w-[132px] overflow-hidden rounded-[10px] bg-white shadow-lg dark:bg-grey-800">
              <ScaledSlide>
                <SlideSurface
                  slide={draggingSlide}
                  accent={accent}
                  brand={brand}
                  showLogo={showLogo}
                />
              </ScaledSlide>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editable && (
        <button
          type="button"
          onClick={onAdd}
          className={`flex items-center justify-center gap-[7px] rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] text-[13px] font-bold text-primary-500 hover:border-primary-500 hover:bg-[#E4EBE7] dark:hover:bg-grey-800 ${
            orientation === 'horizontal'
              ? 'h-[92px] w-[64px] flex-none flex-col'
              : orientation === 'grid'
                ? 'min-h-[92px] w-full'
                : 'w-full py-2.5'
          }`}
          aria-label="Neue Folie"
        >
          <FiPlus size={orientation === 'horizontal' ? 18 : 13} strokeWidth={2.5} />
          {orientation !== 'horizontal' && 'Neue Folie'}
        </button>
      )}
    </div>
  );
}
