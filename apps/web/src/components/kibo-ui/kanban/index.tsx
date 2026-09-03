import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ScrollArea, ScrollBar } from '@gruenerator/ui';
import {
  createContext,
  memo,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import tunnel from 'tunnel-rat';

import type {
  Announcements,
  CollisionDetection,
  DndContextProps,
  DraggableAttributes,
  DraggableSyntheticListeners,
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';

import { cn } from '@/utils/cn';

const t = tunnel();

export type { DragEndEvent } from '@dnd-kit/core';

type KanbanItemProps = {
  id: string;
  name: string;
  column: string;
} & Record<string, unknown>;

type KanbanColumnProps = {
  id: string;
  name: string;
} & Record<string, unknown>;

type KanbanContextProps<
  T extends KanbanItemProps = KanbanItemProps,
  C extends KanbanColumnProps = KanbanColumnProps,
> = {
  columns: C[];
  data: T[];
  activeCardId: string | null;
  cardsByColumn: Map<string, T[]>;
};

const KanbanContext = createContext<KanbanContextProps>({
  columns: [],
  data: [],
  activeCardId: null,
  cardsByColumn: new Map(),
});

// Exposes the column's drag-handle props to a `<KanbanColumnDragHandle>` rendered
// somewhere inside the column (its header). Null when the column isn't draggable,
// which lets the handle hide itself.
type KanbanColumnHandle = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
} | null;

const KanbanColumnHandleContext = createContext<KanbanColumnHandle>(null);

const DragGrip = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="6" cy="4" r="1.3" />
    <circle cx="10" cy="4" r="1.3" />
    <circle cx="6" cy="8" r="1.3" />
    <circle cx="10" cy="8" r="1.3" />
    <circle cx="6" cy="12" r="1.3" />
    <circle cx="10" cy="12" r="1.3" />
  </svg>
);

export const KanbanColumnDragHandle = ({ className }: { className?: string }) => {
  const handle = useContext(KanbanColumnHandleContext);
  if (!handle) return null;
  return (
    <button
      type="button"
      aria-label="Spalte verschieben"
      className={cn(
        'shrink-0 cursor-grab touch-none rounded p-0.5 text-grey-400 hover:text-foreground hover:bg-grey-200 dark:hover:bg-grey-800 border-none bg-transparent',
        className
      )}
      {...handle.attributes}
      {...handle.listeners}
    >
      <DragGrip />
    </button>
  );
};

export type KanbanBoardProps = {
  id: string;
  children: ReactNode;
  className?: string;
  /** When true the column can be reordered by dragging its `<KanbanColumnDragHandle>`. */
  draggable?: boolean;
};

export const KanbanBoard = ({ id, children, className, draggable = false }: KanbanBoardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isOver, isDragging } =
    useSortable({
      id,
      data: { type: 'column' },
      // Keep the column a drop target for cards even when it can't itself be dragged.
      disabled: { draggable: !draggable, droppable: false },
    });

  const style = useMemo(
    () => ({ transition, transform: CSS.Transform.toString(transform) }),
    [transition, transform]
  );

  const handle = useMemo<KanbanColumnHandle>(
    () => (draggable ? { attributes, listeners } : null),
    [draggable, attributes, listeners]
  );

  return (
    <KanbanColumnHandleContext.Provider value={handle}>
      <div
        className={cn(
          'flex w-[260px] sm:w-[300px] shrink-0 h-fit flex-col overflow-hidden rounded-xl bg-grey-100 dark:bg-[#1e1e1e] pb-1 text-xs ring-2 transition-all',
          isOver ? 'ring-primary-500' : 'ring-transparent',
          isDragging && 'opacity-60 z-10',
          className
        )}
        style={style}
        ref={setNodeRef}
      >
        {children}
      </div>
    </KanbanColumnHandleContext.Provider>
  );
};

export type KanbanCardProps<T extends KanbanItemProps = KanbanItemProps> = T & {
  children?: ReactNode;
  className?: string;
};

const KanbanCardInner = <T extends KanbanItemProps = KanbanItemProps>({
  id,
  name,
  children,
  className,
}: KanbanCardProps<T>) => {
  const { attributes, listeners, setNodeRef, transition, transform, isDragging } = useSortable({
    id,
    // dnd-kits Vorgabe ist das englische „sortable"; der Screenreader liest es
    // mitten in einer deutschen Oberfläche vor.
    attributes: { roleDescription: 'Aufgabenkarte' },
  });
  const { activeCardId } = useContext(KanbanContext) as KanbanContextProps;

  const style = useMemo(
    () => ({ transition, transform: CSS.Transform.toString(transform) }),
    [transition, transform]
  );

  // dnd-kit legt `role="button"` und `tabIndex={0}` in `attributes`. Auf dem
  // Sortier-Wrapper macht das die Karte selbst zum Bedienelement — und damit
  // jede Karte zu einem Bedienelement, das ein weiteres enthält (axe
  // `nested-interactive`, WCAG 4.1.2). Am Wrapper ist das nicht reparierbar:
  // sein Enter/Space ist von dnd-kits KeyboardSensor fürs Aufnehmen belegt.
  //
  // Deshalb dieselbe Aufteilung, die die Spalten schon benutzen: der Wrapper
  // behält nur die ZEIGER-Listener (Maus- und Touch-Ziehen der ganzen Karte
  // bleibt also unverändert), `attributes` und die Tastaturbedienung wandern
  // auf einen echten `<button>` als Ziehgriff.
  const pointerListeners = useMemo(
    () => Object.fromEntries(Object.entries(listeners ?? {}).filter(([e]) => e !== 'onKeyDown')),
    [listeners]
  );

  // Die Kopie für das DragOverlay geht durch einen tunnel-rat-Tunnel. Dessen
  // `In` schreibt in einem Layout-Effekt in seinen Store, sobald sich die
  // Identität seiner Kinder ändert — und ein inline gebautes Element ist bei
  // jedem Render neu, also auch bei jeder Zeigerbewegung, die nur `transform`
  // ändert. Memoisiert schreibt der Tunnel nur, wenn sich der Inhalt ändert.
  const overlay = useMemo(
    () => (
      <div
        className={cn(
          'cursor-grab rounded-[6px] bg-background-pure dark:bg-[#282828] shadow-lg ring-2 ring-primary-500 border border-grey-200 dark:border-[#333]',
          isDragging && 'cursor-grabbing',
          className
        )}
      >
        {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
      </div>
    ),
    [children, className, isDragging, name]
  );

  return (
    <>
      <div style={style} {...pointerListeners} ref={setNodeRef}>
        <div
          className={cn(
            'group/kanban-card relative cursor-grab rounded-[6px] bg-background-pure dark:bg-[#282828] border border-grey-200 dark:border-[#333] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:shadow-none',
            isDragging && 'pointer-events-none cursor-grabbing opacity-30',
            className
          )}
        >
          <button
            type="button"
            aria-label={`Karte „${name}" verschieben`}
            className="absolute right-0.5 top-0.5 z-20 cursor-grab touch-none rounded border-none bg-transparent p-0.5 text-grey-400 opacity-0 transition-opacity hover:bg-grey-200 hover:text-foreground focus-visible:opacity-100 group-hover/kanban-card:opacity-100 dark:hover:bg-grey-800"
            {...attributes}
            {...listeners}
          >
            <DragGrip />
          </button>
          {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
        </div>
      </div>
      {activeCardId === id && <t.In>{overlay}</t.In>}
    </>
  );
};

export const KanbanCard = memo(KanbanCardInner) as typeof KanbanCardInner;

export type KanbanCardsProps<T extends KanbanItemProps = KanbanItemProps> = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'id'
> & {
  children: (item: T) => ReactNode;
  id: string;
};

export const KanbanCards = <T extends KanbanItemProps = KanbanItemProps>({
  children,
  className,
  ...props
}: KanbanCardsProps<T>) => {
  const { cardsByColumn } = useContext(KanbanContext) as KanbanContextProps<T>;
  const columnCards = useMemo(() => cardsByColumn.get(props.id) || [], [cardsByColumn, props.id]);
  const items = useMemo(() => columnCards.map((item) => item.id), [columnCards]);

  return (
    <ScrollArea className="overflow-hidden">
      <SortableContext items={items}>
        <div className={cn('flex flex-grow flex-col gap-2 px-2 pb-2 pt-1', className)} {...props}>
          {columnCards.map(children)}
        </div>
      </SortableContext>
      <ScrollBar orientation="vertical" />
    </ScrollArea>
  );
};

export type KanbanHeaderProps = HTMLAttributes<HTMLDivElement>;

export const KanbanHeader = ({ className, ...props }: KanbanHeaderProps) => (
  <div className={cn('m-0 px-3 pt-3 pb-1 font-medium text-sm', className)} {...props} />
);

export type KanbanProviderProps<
  T extends KanbanItemProps = KanbanItemProps,
  C extends KanbanColumnProps = KanbanColumnProps,
> = Omit<DndContextProps, 'children'> & {
  children: (column: C) => ReactNode;
  className?: string;
  columns: C[];
  data: T[];
  after?: ReactNode;
  onDataChange?: (data: T[]) => void;
  onColumnReorder?: (columns: C[]) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
};

export const KanbanProvider = <
  T extends KanbanItemProps = KanbanItemProps,
  C extends KanbanColumnProps = KanbanColumnProps,
>({
  children,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragCancel,
  className,
  columns,
  data,
  after,
  onDataChange,
  onColumnReorder,
  ...props
}: KanbanProviderProps<T, C>) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const itemById = useMemo(() => new Map(data.map((item) => [item.id, item])), [data]);
  const itemIndexById = useMemo(() => new Map(data.map((item, i) => [item.id, i])), [data]);
  const columnById = useMemo(() => new Map(columns.map((col) => [col.id, col])), [columns]);
  const columnIds = useMemo(() => columns.map((col) => col.id), [columns]);

  // While dragging a column, only collide with other columns — otherwise cards
  // (which sit inside columns) would win closestCenter and the column wouldn't
  // find a sibling drop target. Card drags keep the default behaviour.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    if (args.active.data.current?.type === 'column') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.type === 'column'
        ),
      });
    }
    return closestCenter(args);
  }, []);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const item of data) {
      const col = item.column as string;
      const list = map.get(col);
      if (list) {
        list.push(item);
      } else {
        map.set(col, [item]);
      }
    }
    return map;
  }, [data]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const card = itemById.get(event.active.id as string);
      if (card) {
        setActiveCardId(event.active.id as string);
      }
      onDragStart?.(event);
    },
    [itemById, onDragStart]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      // Column drags reorder via the horizontal SortableContext + onDragEnd; the
      // card-move logic below must not run for them.
      if (columnById.has(active.id as string)) {
        onDragOver?.(event);
        return;
      }

      const activeItem = itemById.get(active.id as string);
      if (!activeItem) return;

      const overItem = itemById.get(over.id as string);
      const activeColumn = activeItem.column;
      const overColumn =
        overItem?.column || columnById.get(over.id as string)?.id || columns[0]?.id;

      if (activeColumn !== overColumn) {
        const newData = [...data];
        const activeIndex = itemIndexById.get(active.id as string) ?? -1;
        const overIndex = itemIndexById.get(over.id as string) ?? newData.length - 1;

        if (activeIndex !== -1) {
          newData[activeIndex] = { ...newData[activeIndex], column: overColumn };
          onDataChange?.(
            arrayMove(newData, activeIndex, overIndex >= 0 ? overIndex : newData.length - 1)
          );
        }
      }

      onDragOver?.(event);
    },
    [itemById, itemIndexById, columnById, columns, data, onDataChange, onDragOver]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCardId(null);
      onDragEnd?.(event);

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // Column reorder: `over` may resolve to a card, so map it back to its column.
      if (columnById.has(active.id as string)) {
        const overColumnId = columnById.has(over.id as string)
          ? (over.id as string)
          : itemById.get(over.id as string)?.column;
        const oldIndex = columns.findIndex((c) => c.id === active.id);
        const newIndex = columns.findIndex((c) => c.id === overColumnId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          onColumnReorder?.(arrayMove(columns, oldIndex, newIndex));
        }
        return;
      }

      const oldIndex = itemIndexById.get(active.id as string) ?? -1;
      const newIndex = itemIndexById.get(over.id as string) ?? -1;

      if (oldIndex !== -1 && newIndex !== -1) {
        onDataChange?.(arrayMove([...data], oldIndex, newIndex));
      }
    },
    [columnById, itemById, columns, onColumnReorder, itemIndexById, data, onDataChange, onDragEnd]
  );

  // dnd-kit bricht ein Ziehen auch von sich aus ab — Escape, `visibilitychange`
  // (Tab in den Hintergrund, Rechner in den Ruhezustand). Ohne diesen Zweig
  // blieb `activeCardId` dann bis zum nächsten Ziehen stehen, und mit ihm der
  // Tunnel-`In` der Karte: jeder Board-Render schrieb weiter in den Overlay-
  // Store, und ein späteres Ziehen in einer anderen Lane zeigte zwei Karten
  // im Overlay.
  const handleDragCancel = useCallback(
    (event: DragCancelEvent) => {
      setActiveCardId(null);
      onDragCancel?.(event);
    },
    [onDragCancel]
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const item = itemById.get(active.id as string);
        return `Picked up the card "${item?.name}" from the "${item?.column}" column`;
      },
      onDragOver({ active, over }) {
        const item = itemById.get(active.id as string);
        const col = over ? columnById.get(over.id as string) : undefined;
        return `Dragged the card "${item?.name}" over the "${col?.name}" column`;
      },
      onDragEnd({ active, over }) {
        const item = itemById.get(active.id as string);
        const col = over ? columnById.get(over.id as string) : undefined;
        return `Dropped the card "${item?.name}" into the "${col?.name}" column`;
      },
      onDragCancel({ active }) {
        const item = itemById.get(active.id as string);
        return `Cancelled dragging the card "${item?.name}"`;
      },
    }),
    [itemById, columnById]
  );

  const contextValue = useMemo(
    () => ({ columns, data, activeCardId, cardsByColumn }),
    [columns, data, activeCardId, cardsByColumn]
  );

  return (
    <KanbanContext.Provider value={contextValue}>
      <DndContext
        accessibility={{ announcements }}
        collisionDetection={collisionDetection}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
        {...props}
      >
        <div className={cn('flex gap-5', className)}>
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            {columns.map((column) => children(column))}
          </SortableContext>
          {after}
        </div>
        {typeof window !== 'undefined' &&
          createPortal(
            <DragOverlay>
              <t.Out />
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </KanbanContext.Provider>
  );
};
