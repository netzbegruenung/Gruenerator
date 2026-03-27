import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
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
  DndContextProps,
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

export type KanbanBoardProps = {
  id: string;
  children: ReactNode;
  className?: string;
};

export const KanbanBoard = ({ id, children, className }: KanbanBoardProps) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      className={cn(
        'flex w-[260px] sm:w-[300px] shrink-0 h-fit flex-col overflow-hidden rounded-xl bg-grey-100 dark:bg-[#1e1e1e] pb-1 text-xs ring-2 transition-all',
        isOver ? 'ring-primary-500' : 'ring-transparent',
        className
      )}
      ref={setNodeRef}
    >
      {children}
    </div>
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
  });
  const { activeCardId } = useContext(KanbanContext) as KanbanContextProps;

  const style = useMemo(
    () => ({ transition, transform: CSS.Transform.toString(transform) }),
    [transition, transform]
  );

  return (
    <>
      <div style={style} {...listeners} {...attributes} ref={setNodeRef}>
        <div
          className={cn(
            'cursor-grab rounded-[6px] bg-background-pure dark:bg-[#282828] border border-grey-200 dark:border-[#333] shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:hover:shadow-none',
            isDragging && 'pointer-events-none cursor-grabbing opacity-30',
            className
          )}
        >
          {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
        </div>
      </div>
      {activeCardId === id && (
        <t.In>
          <div
            className={cn(
              'cursor-grab rounded-[6px] bg-background-pure dark:bg-[#282828] shadow-lg ring-2 ring-primary-500 border border-grey-200 dark:border-[#333]',
              isDragging && 'cursor-grabbing',
              className
            )}
          >
            {children ?? <p className="m-0 font-medium text-sm">{name}</p>}
          </div>
        </t.In>
      )}
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
  const columnCards = cardsByColumn.get(props.id) || [];
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
  onDragStart?: (event: DragStartEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
};

export const KanbanProvider = <
  T extends KanbanItemProps = KanbanItemProps,
  C extends KanbanColumnProps = KanbanColumnProps,
>({
  children,
  onDragStart,
  onDragEnd,
  onDragOver,
  className,
  columns,
  data,
  after,
  onDataChange,
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

      const oldIndex = itemIndexById.get(active.id as string) ?? -1;
      const newIndex = itemIndexById.get(over.id as string) ?? -1;

      if (oldIndex !== -1 && newIndex !== -1) {
        onDataChange?.(arrayMove([...data], oldIndex, newIndex));
      }
    },
    [itemIndexById, data, onDataChange, onDragEnd]
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
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
        {...props}
      >
        <div className={cn('flex gap-5', className)}>
          {columns.map((column) => children(column))}
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
