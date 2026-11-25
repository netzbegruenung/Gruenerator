/**
 * The files picked on /video, in the order they will be used: Untertitel joins
 * the videos in this order, the editor lays them out as clips in this order,
 * KI-Schnitt keeps it as the spoken order. Sorted by dragging the handle, by
 * keyboard on the handle (space, arrows, space) or with the arrow buttons.
 *
 * The drag attributes sit on the handle, not the row: dnd-kit gives them
 * `role="button"`, and on the row they would wrap the other buttons (the
 * `nested-interactive` finding on /boards). Same library and sensors as
 * SlideThumbnailList in packages/presentations.
 *
 * Accessibility (WCAG 2.2 AA): dragging has a single-pointer alternative
 * (2.5.7, the arrow buttons); every move — drag, keyboard or button — is
 * announced in German; an arrow button at the edge stays focusable
 * (`aria-disabled`) so focus is never dropped, and removing a row moves focus
 * to the next row, or to `afterLastRemoved` when the list empties.
 */
import { useRef, useState } from 'react';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@gruenerator/ui';
import { cn } from '@/utils/cn';
import { ArrowDown, ArrowUp, Film, GripVertical, Image, Music, Trash2 } from 'lucide-react';

export interface PickedFile {
  id: string;
  file: File;
}

const kindIcon = (file: File) =>
  file.type.startsWith('image/') ? Image : file.type.startsWith('audio/') ? Music : Film;

function Row({
  item,
  index,
  count,
  onMove,
  onRemove,
}: {
  item: PickedFile;
  index: number;
  count: number;
  onMove: (from: number, to: number, via: 'button') => void;
  onRemove: (id: string) => void;
}) {
  const atTop = index === 0;
  const atBottom = index === count - 1;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, attributes: { roleDescription: 'sortierbare Datei' } });
  const Icon = kindIcon(item.file);
  const name = item.file.name;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-file-id={item.id}
      className={cn(
        'flex items-center gap-xs rounded-lg bg-white px-xs py-xs dark:bg-grey-900',
        isDragging && 'relative z-10 shadow-lg'
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`${name} verschieben, Position ${index + 1} von ${count}`}
        data-drag-handle
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-grey-500 hover:bg-grey-100 kbd:outline-2 kbd:outline-offset-2 active:cursor-grabbing dark:hover:bg-grey-800"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <span aria-hidden className="w-5 shrink-0 text-right text-sm tabular-nums text-grey-500">
        {index + 1}
      </span>
      <Icon className="size-4 shrink-0 text-grey-500" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${name} nach oben`}
        aria-disabled={atTop}
        className={cn(atTop && 'opacity-40')}
        onClick={() => !atTop && onMove(index, index - 1, 'button')}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${name} nach unten`}
        aria-disabled={atBottom}
        className={cn(atBottom && 'opacity-40')}
        onClick={() => !atBottom && onMove(index, index + 1, 'button')}
      >
        <ArrowDown className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`${name} entfernen`}
        onClick={() => onRemove(item.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

export function SortableFileList({
  items,
  onChange,
  afterLastRemoved,
}: {
  items: PickedFile[];
  onChange: (items: PickedFile[]) => void;
  /** Gets focus when the last file is removed. */
  afterLastRemoved: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [status, setStatus] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const nameOf = (id: unknown) => items.find((i) => i.id === id)?.file.name ?? 'Datei';
  const positionOf = (id: unknown) => items.findIndex((i) => i.id === id) + 1;

  const move = (from: number, to: number, via?: 'button') => {
    onChange(arrayMove(items, from, to));
    // dnd-kit announces its own moves; the buttons need the live region.
    if (via)
      setStatus(`${items[from].file.name} ist jetzt an Position ${to + 1} von ${items.length}.`);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(
      items.findIndex((i) => i.id === active.id),
      items.findIndex((i) => i.id === over.id)
    );
  };
  const remove = (id: string) => {
    const index = items.findIndex((i) => i.id === id);
    const rest = items.filter((i) => i.id !== id);
    setStatus(`${nameOf(id)} entfernt.`);
    onChange(rest);
    const next = rest[Math.min(index, rest.length - 1)];
    requestAnimationFrame(() => {
      if (!next) return afterLastRemoved();
      listRef.current
        ?.querySelector<HTMLElement>(`[data-file-id="${next.id}"] [data-drag-handle]`)
        ?.focus();
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Leertaste zum Aufnehmen, Pfeiltasten zum Verschieben, Leertaste zum Ablegen, Escape zum Abbrechen.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `${nameOf(active.id)} aufgenommen, Position ${positionOf(active.id)} von ${items.length}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${nameOf(active.id)} über Position ${positionOf(over.id)} von ${items.length}.`
              : `${nameOf(active.id)} ist außerhalb der Liste.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `${nameOf(active.id)} abgelegt an Position ${positionOf(over.id)} von ${items.length}.`
              : `${nameOf(active.id)} abgelegt.`,
          onDragCancel: ({ active }) =>
            `Verschieben abgebrochen, ${nameOf(active.id)} bleibt an seinem Platz.`,
        },
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol ref={listRef} aria-label="Reihenfolge der Dateien" className="flex flex-col gap-xs">
          {items.map((item, index) => (
            <Row
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </ol>
      </SortableContext>
      <p role="status" className="sr-only">
        {status}
      </p>
    </DndContext>
  );
}
