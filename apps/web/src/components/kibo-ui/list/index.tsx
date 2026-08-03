/* eslint-disable */
'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type { DragEndEvent } from '@dnd-kit/core';

type Status = {
  id: string;
  name: string;
  color: string;
};

type Feature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  status: Status;
};

export type ListItemsProps = {
  children: ReactNode;
  className?: string;
};

export const ListItems = ({ children, className }: ListItemsProps) => (
  <div className={cn('flex flex-1 flex-col gap-2 p-3', className)}>{children}</div>
);

export type ListHeaderProps =
  | {
      children: ReactNode;
    }
  | {
      name: Status['name'];
      color: Status['color'];
      className?: string;
    };

export const ListHeader = (props: ListHeaderProps) =>
  'children' in props ? (
    props.children
  ) : (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 bg-grey-100 dark:bg-[#1e1e1e] p-3',
        props.className
      )}
    >
      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: props.color }} />
      <p className="m-0 font-semibold text-sm">{props.name}</p>
    </div>
  );

export type ListGroupProps = {
  id: Status['id'];
  children: ReactNode;
  className?: string;
};

export const ListGroup = ({ id, children, className }: ListGroupProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={cn(
        'bg-grey-50 dark:bg-[#1e1e1e] transition-colors',
        isOver && 'bg-grey-100 dark:bg-grey-800',
        className
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
};

export type ListItemProps = Pick<Feature, 'id' | 'name'> & {
  readonly index: number;
  readonly parent: string;
  readonly children?: ReactNode;
  readonly className?: string;
};

export const ListItem = ({ id, name, index, parent, children, className }: ListItemProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { index, parent },
    attributes: { roleDescription: 'Aufgabe' },
  });

  // Wie beim Kanban-Board: `attributes` enthaelt `role="button"` + `tabIndex`
  // und macht damit jede Zeile zu einem Bedienelement, das ein weiteres
  // enthaelt (axe `nested-interactive`, WCAG 4.1.2). Zeiger-Ziehen bleibt auf
  // der ganzen Zeile, Tastatur-Ziehen sitzt auf dem Griff.
  const pointerListeners = Object.fromEntries(
    Object.entries(listeners ?? {}).filter(([event]) => event !== 'onKeyDown')
  );

  return (
    <div
      className={cn(
        'group/list-item flex cursor-grab items-center gap-2 rounded-md border bg-background p-2 shadow-sm',
        isDragging && 'cursor-grabbing',
        className
      )}
      style={{
        transform: transform ? `translateX(${transform.x}px) translateY(${transform.y}px)` : 'none',
      }}
      {...pointerListeners}
      ref={setNodeRef}
    >
      <button
        type="button"
        aria-label={`„${name}" verschieben`}
        className="shrink-0 cursor-grab touch-none rounded border-none bg-transparent p-0.5 text-grey-400 opacity-0 transition-opacity hover:bg-grey-200 hover:text-foreground focus-visible:opacity-100 group-hover/list-item:opacity-100 dark:hover:bg-grey-800"
        {...attributes}
        {...listeners}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="4" r="1.3" />
          <circle cx="10" cy="4" r="1.3" />
          <circle cx="6" cy="8" r="1.3" />
          <circle cx="10" cy="8" r="1.3" />
          <circle cx="6" cy="12" r="1.3" />
          <circle cx="10" cy="12" r="1.3" />
        </svg>
      </button>
      {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
    </div>
  );
};

export type ListProviderProps = {
  children: ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
};

export const ListProvider = ({ children, onDragEnd, className }: ListProviderProps) => {
  // Without an explicit TouchSensor, dnd-kit's default PointerSensor claims the
  // very first touchmove. Since ListItem spreads its drag listeners over the
  // whole row and the list is restricted to the vertical axis, every attempt to
  // scroll the list on a phone started a drag instead. The delay/tolerance
  // constraint makes a long-press drag and leaves short swipes to the scroller —
  // same configuration as the kanban board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <div className={cn('flex size-full flex-col', className)}>{children}</div>
    </DndContext>
  );
};
