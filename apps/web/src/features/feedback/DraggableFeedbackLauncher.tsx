import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { GripVertical } from 'lucide-react';
import { useCallback, useRef, useState, type JSX, type RefObject } from 'react';

import { cn } from '@/utils/cn';

export type LauncherCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const STORAGE_KEY = 'feedback-launcher-corner';
const EDGE_MARGIN = 16;

const cornerClasses: Record<LauncherCorner, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
};

const cornerLabels: Record<LauncherCorner, string> = {
  'top-left': 'oben links',
  'top-right': 'oben rechts',
  'bottom-left': 'unten links',
  'bottom-right': 'unten rechts',
};

function isCorner(value: string | null): value is LauncherCorner {
  return value != null && value in cornerClasses;
}

function loadCorner(fallback: LauncherCorner): LauncherCorner {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isCorner(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

// Keyboard-Drag springt direkt zwischen den vier Ecken statt pixelweise zu wandern.
const cornerCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context }
) => {
  const rect = context.collisionRect;
  if (!rect) return undefined;

  switch (event.code) {
    case 'ArrowLeft':
      event.preventDefault();
      return { ...currentCoordinates, x: EDGE_MARGIN };
    case 'ArrowRight':
      event.preventDefault();
      return { ...currentCoordinates, x: window.innerWidth - rect.width - EDGE_MARGIN };
    case 'ArrowUp':
      event.preventDefault();
      return { ...currentCoordinates, y: EDGE_MARGIN };
    case 'ArrowDown':
      event.preventDefault();
      return { ...currentCoordinates, y: window.innerHeight - rect.height - EDGE_MARGIN };
    default:
      return undefined;
  }
};

interface DraggableFeedbackLauncherProps {
  onOpen: () => void;
  defaultCorner?: LauncherCorner;
}

interface LauncherPillProps {
  onOpen: () => void;
  corner: LauncherCorner;
  suppressClickRef: RefObject<boolean>;
}

function LauncherPill({ onOpen, corner, suppressClickRef }: LauncherPillProps): JSX.Element {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, isDragging } =
    useDraggable({ id: 'feedback-launcher' });

  // Pointer-Drag auf der ganzen Pill, Keyboard-Drag nur über den Griff —
  // sonst würde Enter/Leertaste auf dem Feedback-Button den Drag starten
  // statt den Dialog zu öffnen.
  const { onKeyDown: _dragKeyDown, ...pointerListeners } = (listeners ?? {}) as Record<
    string,
    (event: React.SyntheticEvent) => void
  >;

  return (
    <div
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        'feedback-widget-fab fixed z-[1000] flex items-center overflow-hidden rounded-full',
        'bg-primary-600 text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)]',
        'transition-[box-shadow] duration-200 ease-in-out',
        isDragging
          ? 'cursor-grabbing shadow-[0_8px_24px_rgba(0,0,0,0.3)]'
          : 'hover:shadow-[0_6px_16px_rgba(0,0,0,0.25)]',
        cornerClasses[corner]
      )}
    >
      <button
        type="button"
        {...pointerListeners}
        onClick={() => {
          if (suppressClickRef.current) return;
          onOpen();
        }}
        className="cursor-pointer py-3 pl-5 pr-2 text-sm font-semibold hover:bg-primary-700"
      >
        Feedback
      </button>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Feedback-Button verschieben (aktuell ${cornerLabels[corner]})`}
        aria-roledescription="verschiebbar"
        className={cn(
          'flex h-full items-center self-stretch py-3 pl-1 pr-2 text-white/70 hover:bg-primary-700 hover:text-white',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function DraggableFeedbackLauncher({
  onOpen,
  defaultCorner = 'bottom-right',
}: DraggableFeedbackLauncherProps): JSX.Element {
  const [corner, setCorner] = useState<LauncherCorner>(() => loadCorner(defaultCorner));
  const suppressClickRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: cornerCoordinateGetter })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // Der Klick nach dem Loslassen darf den Dialog nicht öffnen.
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    const rect = event.active.rect.current.translated;
    if (!rect) return;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const next: LauncherCorner = `${centerY < window.innerHeight / 2 ? 'top' : 'bottom'}-${
      centerX < window.innerWidth / 2 ? 'left' : 'right'
    }`;

    setCorner(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToWindowEdges]}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Drücke Leertaste oder Enter, um den Feedback-Button aufzunehmen. Bewege ihn mit den Pfeiltasten in eine der vier Bildschirmecken und lasse ihn mit Leertaste oder Enter wieder los. Mit Escape brichst du das Verschieben ab.',
        },
        announcements: {
          onDragStart: () => 'Feedback-Button aufgenommen.',
          onDragMove: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => 'Feedback-Button abgelegt.',
          onDragCancel: () => 'Verschieben abgebrochen.',
        },
      }}
    >
      <LauncherPill onOpen={onOpen} corner={corner} suppressClickRef={suppressClickRef} />
    </DndContext>
  );
}
