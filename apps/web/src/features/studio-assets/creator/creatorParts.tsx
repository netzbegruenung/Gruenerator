import { type StudioAssetSource } from '@gruenerator/contracts';
import { sameColor } from '@gruenerator/shared/stickers';
import { Label, Switch } from '@gruenerator/ui';
import { useEffect, useId, useState, type HTMLAttributes, type JSX, type ReactNode } from 'react';

import { CHECKERBOARD } from '../../studio-tools/components/ToolResultCard';
import { TOOL_LABEL } from '../../studio-tools/components/ToolUi';

import { cn } from '@/utils/cn';

/** What a designer hands to the save step. */
export interface StickerDraft {
  blob: Blob;
  suggestedTitle: string;
  source: StudioAssetSource;
}

/** A designer's two halves: the stage in the middle, its controls in the side panel. */
export interface DesignerParts {
  stage: ReactNode;
  controls: ReactNode;
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
export function StageFrame({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      {...rest}
      className={cn(
        CHECKERBOARD,
        'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[4%] bg-background shadow-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-background-alt',
        className
      )}
    >
      {children}
    </div>
  );
}

/** A titled block of the side panel, styled like the Profilbild inspector. */
export function PanelSection({
  heading,
  aside,
  children,
}: {
  heading: string;
  aside?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-sm">
        <h2 id={id} className="m-0 text-base font-semibold text-foreground-heading">
          {heading}
        </h2>
        {aside ? (
          <span className="min-w-0 truncate text-[13px] text-muted-foreground tabular-nums">
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
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
