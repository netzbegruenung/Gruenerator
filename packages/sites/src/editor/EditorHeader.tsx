import { cn } from '@gruenerator/shared/utils';
import { Button } from '@gruenerator/ui';
import { type ReactNode, type Ref } from 'react';
import {
  FiArrowLeft,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiEye,
  FiMonitor,
  FiSmartphone,
  FiTablet,
} from 'react-icons/fi';

import { useDraftHistory } from '../draft/SiteDraftContext';
import { type SaveStatus } from '../draft/useSiteDraftSession';

import { useUndoShortcuts } from './useUndoShortcuts';

export type CanvasDevice = 'desktop' | 'tablet' | 'phone';

/** Widths the page is edited at; `null` fills the canvas. */
export const CANVAS_DEVICE_WIDTH: Record<CanvasDevice, number | null> = {
  desktop: null,
  tablet: 768,
  phone: 375,
};

const DEVICES = [
  { value: 'desktop', label: 'Desktop', icon: FiMonitor },
  { value: 'tablet', label: 'Tablet', icon: FiTablet },
  { value: 'phone', label: 'Handy', icon: FiSmartphone },
] as const satisfies ReadonlyArray<{ value: CanvasDevice; label: string; icon: unknown }>;

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Gespeichert',
  saving: 'Wird gespeichert …',
  offline: 'Offline – Änderungen bleiben auf diesem Gerät',
};

interface EditorHeaderProps {
  save: SaveStatus;
  /** The site name with its menu. */
  menu: ReactNode;
  /** The publish action. */
  publish: ReactNode;
  device: CanvasDevice;
  onDeviceChange: (device: CanvasDevice) => void;
  onPreview: () => void;
  onBack?: () => void;
  previewButtonRef?: Ref<HTMLButtonElement>;
  /** Who else is here and how to invite them; sits before undo. */
  children?: ReactNode;
}

const iconButton = 'text-grey-600 hover:text-foreground dark:text-grey-400';

function Divider() {
  return <span aria-hidden className="mx-xs h-5 w-px shrink-0 bg-grey-200 dark:bg-grey-700" />;
}

/**
 * One quiet bar in three zones: where am I (back, site, save state), how do I see the page
 * (device), what happens to it (undo, preview, publish). Colour belongs to the publish button only.
 */
export function EditorHeader({
  save,
  menu,
  publish,
  device,
  onDeviceChange,
  onPreview,
  onBack,
  previewButtonRef,
  children,
}: EditorHeaderProps) {
  const history = useDraftHistory();
  useUndoShortcuts(typeof window === 'undefined' ? null : window);
  const width = CANVAS_DEVICE_WIDTH[device];

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-xxs border-b border-grey-200 bg-background-pure px-xs dark:border-grey-700">
      <h1 className="sr-only">Website bearbeiten</h1>
      {onBack && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Zurück"
            title="Zurück"
            className={iconButton}
          >
            <FiArrowLeft />
          </Button>
          <Divider />
        </>
      )}
      <div className="flex min-w-0 items-center">{menu}</div>
      <span
        role="status"
        className={cn(
          'ml-xs truncate text-xs text-grey-600 dark:text-grey-400',
          // On a phone only a problem is worth the room.
          save === 'saved' && 'max-sm:hidden'
        )}
      >
        {SAVE_LABELS[save]}
      </span>

      <div
        role="group"
        aria-label="Gerätegröße"
        className="absolute left-1/2 flex -translate-x-1/2 items-center max-canvas-mobile:hidden"
      >
        {DEVICES.map(({ value, label, icon: Icon }) => (
          <Button
            key={value}
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            title={label}
            aria-pressed={device === value}
            onClick={() => onDeviceChange(value)}
            className={cn(
              'relative',
              device === value
                ? 'text-foreground after:absolute after:inset-x-2 after:-bottom-[5px] after:h-0.5 after:rounded-full after:bg-foreground'
                : iconButton
            )}
          >
            <Icon />
          </Button>
        ))}
        <span className="ml-xs w-14 text-xs tabular-nums text-grey-600 dark:text-grey-400">
          {width ? `${width} px` : ''}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-xxs">
        {children}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={history.undo}
          disabled={!history.canUndo}
          aria-label="Rückgängig"
          title="Rückgängig (⌘Z)"
          className={iconButton}
        >
          <FiCornerUpLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={history.redo}
          disabled={!history.canRedo}
          aria-label="Wiederholen"
          title="Wiederholen (⇧⌘Z)"
          className={cn(iconButton, 'max-sm:hidden')}
        >
          <FiCornerUpRight />
        </Button>
        <Divider />
        <Button
          ref={previewButtonRef}
          variant="ghost"
          size="icon-sm"
          onClick={onPreview}
          aria-label="Vorschau"
          title="Vorschau"
          className={iconButton}
        >
          <FiEye />
        </Button>
        {publish}
      </div>
    </header>
  );
}
