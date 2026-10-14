import { sameColor } from '@gruenerator/shared/stickers';
import { Label, Switch } from '@gruenerator/ui';
import { useEffect, useId, useState, type JSX, type ReactNode } from 'react';

import { CHECKERBOARD } from '../../studio-tools/components/ToolResultCard';
import { TOOL_LABEL, TOOL_PANEL } from '../../studio-tools/components/ToolUi';

import { cn } from '@/utils/cn';

/** What a designer hands to the save step. */
export interface StickerDraft {
  blob: Blob;
  suggestedTitle: string;
}

export function useObjectUrl(blob: Blob | null): string | null {
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // The URL is an external resource: created and revoked by the same effect run.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntry({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return entry && entry.blob === blob ? entry.url : null;
}

/** Checkerboard stage so transparent areas read as transparent. */
export function PreviewFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        CHECKERBOARD,
        'flex aspect-square w-full items-center justify-center overflow-hidden rounded-[14px] border border-grey-200 p-md dark:border-grey-700',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Preview left, controls right; stacked on narrow screens. */
export function DesignLayout({
  preview,
  children,
}: {
  preview: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="grid gap-md md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start">
      <div className="md:sticky md:top-md">{preview}</div>
      <div className={cn(TOOL_PANEL, 'flex min-w-0 flex-col gap-lg')}>{children}</div>
    </div>
  );
}

const RING =
  'outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-2';

export function SwatchPicker({
  label,
  swatches,
  value,
  onChange,
  disabledColor = null,
}: {
  label: string;
  swatches: { id: string; label: string; color: string }[];
  value: string;
  onChange: (color: string) => void;
  /** A colour that may not be picked here, e.g. the one the text already uses. */
  disabledColor?: string | null;
}): JSX.Element {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-sm">
      <span id={labelId} className={TOOL_LABEL}>
        {label}
      </span>
      <div className="flex flex-wrap gap-sm p-1">
        {swatches.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            aria-pressed={sameColor(value, s.color)}
            title={s.label}
            disabled={disabledColor !== null && sameColor(disabledColor, s.color)}
            onClick={() => onChange(s.color)}
            className={cn(
              'size-10 shrink-0 cursor-pointer rounded-full border border-grey-300 disabled:cursor-not-allowed disabled:opacity-30 max-md:size-11 dark:border-grey-600',
              RING
            )}
            style={{ background: s.color }}
          />
        ))}
      </div>
    </div>
  );
}

export function SwitchRow({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}): JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between gap-sm">
        <Label htmlFor={id} className={TOOL_LABEL}>
          {label}
        </Label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && children}
    </div>
  );
}
