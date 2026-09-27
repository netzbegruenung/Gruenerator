import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  cornerInsetStyle,
  useCornerClearance,
  type CornerClearance,
  type ScreenCorner,
} from '@gruenerator/ui';
import { Megaphone } from 'lucide-react';
import { useCallback, useId, useRef, useState, type JSX, type RefObject } from 'react';

import { cn } from '@/utils/cn';

export type LauncherCorner = ScreenCorner;

const STORAGE_KEY = 'feedback-launcher-corner';

const cornerLabels: Record<LauncherCorner, string> = {
  'top-left': 'oben links',
  'top-right': 'oben rechts',
  'bottom-left': 'unten links',
  'bottom-right': 'unten rechts',
};

function isCorner(value: string | null): value is LauncherCorner {
  return value != null && value in cornerLabels;
}

function loadCorner(fallback: LauncherCorner): LauncherCorner {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isCorner(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

function cornerAfterArrow(corner: LauncherCorner, key: string): LauncherCorner | null {
  const [vertical, horizontal] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  switch (key) {
    case 'ArrowLeft':
      return `${vertical}-left`;
    case 'ArrowRight':
      return `${vertical}-right`;
    case 'ArrowUp':
      return `top-${horizontal}`;
    case 'ArrowDown':
      return `bottom-${horizontal}`;
    default:
      return null;
  }
}

type LauncherVariant = 'text' | 'icon';

interface DraggableFeedbackLauncherProps {
  onOpen: () => void;
  defaultCorner?: LauncherCorner;
  variant?: LauncherVariant;
}

interface LauncherButtonProps {
  onOpen: () => void;
  corner: LauncherCorner;
  clearance: CornerClearance;
  variant: LauncherVariant;
  instructionsId: string;
  onArrowKey: (key: string) => void;
  suppressClickRef: RefObject<boolean>;
}

function LauncherButton({
  onOpen,
  corner,
  clearance,
  variant,
  instructionsId,
  onArrowKey,
  suppressClickRef,
}: LauncherButtonProps): JSX.Element {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({
    id: 'feedback-launcher',
  });

  // Nur die Pointer-Listener übernehmen — dnd-kits onKeyDown würde Enter/
  // Leertaste als Drag-Aktivierung kapern statt den Dialog zu öffnen. Das
  // Tastatur-Verschieben läuft stattdessen direkt über die Pfeiltasten.
  const { onKeyDown: _dragKeyDown, ...pointerListeners } = (listeners ?? {}) as Record<
    string,
    (event: React.SyntheticEvent) => void
  >;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...pointerListeners}
      onClick={() => {
        if (suppressClickRef.current) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          onArrowKey(e.key);
        }
      }}
      aria-label={variant === 'icon' ? 'Feedback geben' : undefined}
      // Sprechblase und Wort „Feedback" allein lasen sich wie ein zweites
      // Chatfenster; Megafon und Titel sagen schon vor dem Klick, wohin der
      // Text geht.
      title="Feedback an die Entwicklung senden"
      aria-describedby={instructionsId}
      style={{
        ...cornerInsetStyle(corner, clearance),
        ...(transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined),
      }}
      className={cn(
        'feedback-widget-fab fixed z-[1000] flex items-center justify-center rounded-full',
        'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-500',
        'shadow-[0_4px_12px_rgba(0,0,0,0.2)] duration-200 ease-in-out',
        // Die Kanten-Abstände werden animiert, damit der Button sichtbar zur
        // Seite gleitet, wenn ein Panel aufgeht, statt zu springen.
        'transition-[box-shadow,top,right,bottom,left]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        isDragging
          ? 'cursor-grabbing shadow-[0_8px_24px_rgba(0,0,0,0.3)]'
          : 'cursor-pointer hover:shadow-[0_6px_16px_rgba(0,0,0,0.25)]',
        variant === 'icon' ? 'size-12' : 'px-5 py-3 text-sm font-semibold'
      )}
    >
      {variant === 'icon' ? <Megaphone className="size-5" aria-hidden="true" /> : 'Feedback'}
    </button>
  );
}

export default function DraggableFeedbackLauncher({
  onOpen,
  defaultCorner = 'bottom-right',
  variant = 'text',
}: DraggableFeedbackLauncherProps): JSX.Element | null {
  const [corner, setCorner] = useState<LauncherCorner>(() => loadCorner(defaultCorner));
  const [announcement, setAnnouncement] = useState('');
  const suppressClickRef = useRef(false);
  const instructionsId = useId();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const clearance = useCornerClearance(corner);

  const moveToCorner = useCallback((next: LauncherCorner) => {
    setCorner(next);
    setAnnouncement(`Feedback-Button verschoben nach ${cornerLabels[next]}.`);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  const handleArrowKey = useCallback((key: string) => {
    setCorner((current) => {
      const next = cornerAfterArrow(current, key);
      if (!next || next === current) return current;
      setAnnouncement(`Feedback-Button verschoben nach ${cornerLabels[next]}.`);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      // Der Klick nach dem Loslassen darf den Dialog nicht öffnen.
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      const rect = event.active.rect.current.translated;
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      moveToCorner(
        `${centerY < window.innerHeight / 2 ? 'top' : 'bottom'}-${
          centerX < window.innerWidth / 2 ? 'left' : 'right'
        }`
      );
    },
    [moveToCorner]
  );

  // Ein Vollbild-Panel an dieser Ecke lässt keinen Platz zum Ausweichen — dann
  // ist Verschwinden richtiger als eine Pille über fremden Bedienelementen.
  if (clearance.blocked) return null;

  return (
    <DndContext sensors={sensors} modifiers={[restrictToWindowEdges]} onDragEnd={handleDragEnd}>
      <LauncherButton
        onOpen={onOpen}
        corner={corner}
        clearance={clearance}
        variant={variant}
        instructionsId={instructionsId}
        onArrowKey={handleArrowKey}
        suppressClickRef={suppressClickRef}
      />
      <span id={instructionsId} className="sr-only">
        Mit den Pfeiltasten verschiebst du den Button in eine andere Bildschirmecke, aktuell{' '}
        {cornerLabels[corner]}.
      </span>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </DndContext>
  );
}
