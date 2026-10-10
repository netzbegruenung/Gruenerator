import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { type ReactNode, useId, useState } from 'react';

import { downloadDataUrl } from '../../../utils/downloadFile';

import { TOOL_ACTIONS, TOOL_PANEL, TOOL_PILL } from './ToolUi';

import { cn } from '@/utils/cn';

const CHECKERBOARD =
  'bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-[image:linear-gradient(45deg,var(--color-grey-200)_25%,transparent_25%,transparent_75%,var(--color-grey-200)_75%),linear-gradient(45deg,var(--color-grey-200)_25%,transparent_25%,transparent_75%,var(--color-grey-200)_75%)] dark:bg-[image:linear-gradient(45deg,var(--color-grey-700)_25%,transparent_25%,transparent_75%,var(--color-grey-700)_75%),linear-gradient(45deg,var(--color-grey-700)_25%,transparent_25%,transparent_75%,var(--color-grey-700)_75%)]';

export interface ToolResultCardProps {
  beforeSrc: string;
  afterSrc: string;
  /** Shows a checkerboard behind the result so transparent areas are visible. */
  transparent?: boolean;
  downloadName: string;
  /** The button renders only when this is given; the page decides what gets minted. */
  onEditInCanvas?: () => Promise<void>;
  /** Rendered at the end of the action bar, e.g. „Anderes Bild“. */
  extraActions?: ReactNode;
  className?: string;
}

type View = 'before' | 'after';

export function ToolResultCard({
  beforeSrc,
  afterSrc,
  transparent = false,
  downloadName,
  onEditInCanvas,
  extraActions,
  className,
}: ToolResultCardProps) {
  const groupId = useId();
  const [view, setView] = useState<View>('after');
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const src = view === 'after' ? afterSrc : beforeSrc;
  const showChecker = transparent && view === 'after';

  const editInCanvas = async () => {
    if (!onEditInCanvas || canvasBusy) return;
    setError(null);
    setCanvasBusy(true);
    try {
      await onEditInCanvas();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Der Canvas konnte nicht geöffnet werden.');
    } finally {
      setCanvasBusy(false);
    }
  };

  const download = async () => {
    setError(null);
    try {
      await downloadDataUrl(afterSrc, downloadName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Der Download ist fehlgeschlagen.');
    }
  };

  return (
    <div className={cn(TOOL_PANEL, 'flex flex-col gap-md', className)}>
      <div role="group" aria-labelledby={groupId} className="flex items-center gap-xs">
        <span id={groupId} className="sr-only">
          Ansicht
        </span>
        {(['before', 'after'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={TOOL_PILL}
          >
            {v === 'before' ? 'Vorher' : 'Nachher'}
          </button>
        ))}
      </div>

      <div
        aria-live="polite"
        className={cn(
          'flex min-h-[200px] items-center justify-center overflow-hidden rounded-[10px] bg-grey-50 dark:bg-grey-900',
          showChecker && CHECKERBOARD
        )}
      >
        <img
          src={src}
          alt={view === 'after' ? 'Ergebnis' : 'Originalbild'}
          className="max-h-[520px] w-full object-contain max-md:max-h-[420px]"
        />
      </div>

      <div className={TOOL_ACTIONS}>
        <Button type="button" variant="brand" onClick={() => void download()}>
          Herunterladen
        </Button>
        {onEditInCanvas ? (
          <Button
            type="button"
            variant="outline"
            disabled={canvasBusy}
            onClick={() => void editInCanvas()}
          >
            {canvasBusy ? 'Canvas wird geöffnet …' : 'In Canvas bearbeiten'}
          </Button>
        ) : null}
        {extraActions}
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
