import { type SharepicTweak, type SharepicTweakId } from '@gruenerator/canvas-editor/composer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { RotateCcw } from 'lucide-react';
import { useId } from 'react';

import { cn } from '../../../utils/cn';

type OnTweak = (id: SharepicTweakId, value: string) => void;

/** A group with more segments than this needs both columns, or its short texts overflow. */
const WIDE_GROUP = 3;

/** One brand colour, or two for dark and light in turn. */
function Swatch({ colors }: { colors: string[] }) {
  return (
    <span
      aria-hidden="true"
      className="block size-full rounded-full"
      style={{
        background:
          colors.length > 1
            ? `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`
            : colors[0],
      }}
    />
  );
}

interface SharepicSwatchesProps {
  tweak: SharepicTweak;
  onChange: OnTweak;
  disabled: boolean;
  size: 'sm' | 'lg';
  tone: 'header' | 'surface';
}

/** The colour axis as a row of swatches: the header pill, or the sheet's full-width row. */
export function SharepicSwatches({ tweak, onChange, disabled, size, tone }: SharepicSwatchesProps) {
  return (
    <div
      role="radiogroup"
      aria-label={tweak.label}
      className={cn(
        'flex items-center',
        size === 'sm' ? 'gap-1.5' : 'w-full justify-between',
        tone === 'header' && 'rounded-full bg-black/20 px-2 py-1'
      )}
    >
      {tweak.options.map((option) => {
        const checked = option.value === tweak.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            disabled={disabled || option.disabled}
            onClick={() => onChange(tweak.id, option.value)}
            className={cn(
              'shrink-0 rounded-full border transition-shadow disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'size-[22px]' : 'size-11',
              tone === 'header' ? 'border-white/50' : 'border-border',
              checked &&
                (tone === 'header'
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-[#00573a]'
                  : 'ring-2 ring-primary-600 ring-offset-2 ring-offset-card')
            )}
          >
            <Swatch colors={option.swatch ?? []} />
          </button>
        );
      })}
    </div>
  );
}

interface TweakSegmentsProps {
  tweak: SharepicTweak;
  onChange: OnTweak;
  disabled: boolean;
  labelledBy: string;
  className?: string;
  itemClassName?: string;
}

function TweakSegments({
  tweak,
  onChange,
  disabled,
  labelledBy,
  className,
  itemClassName,
}: TweakSegmentsProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={tweak.value ?? ''}
      onValueChange={(v) => v && onChange(tweak.id, v)}
      aria-labelledby={labelledBy}
      className={className}
    >
      {tweak.options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          disabled={disabled || o.disabled}
          aria-label={o.label}
          title={o.label}
          className={itemClassName}
        >
          {o.short}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

interface FinishProps {
  tweaks: SharepicTweak[];
  onChange: OnTweak;
  /** Set once the person has switched something: offers the draft back. */
  onReset: (() => void) | null;
  disabled: boolean;
}

/** The non-colour axes, under the header from md up: one row at lg, two columns below. */
export function SharepicFinishBar({
  tweaks,
  onChange,
  onReset,
  disabled,
  hidden,
}: FinishProps & { hidden: boolean }) {
  const baseId = useId();
  const axes = tweaks.filter((t) => t.id !== 'farbe');
  if (!axes.length) return null;
  return (
    <div
      id="sharepic-feinschliff"
      hidden={hidden}
      role="group"
      aria-label="Feinschliff"
      className="relative grid w-full shrink-0 grid-cols-2 gap-x-5 gap-y-3 border-b border-border bg-card px-[18px] py-3.5 max-md:hidden lg:flex lg:flex-wrap lg:items-center lg:justify-center lg:gap-x-6 lg:gap-y-2 lg:py-2.5"
    >
      {axes.map((tweak) => {
        const labelId = `${baseId}-${tweak.id}`;
        return (
          <div
            key={tweak.id}
            className={cn(
              'flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2',
              tweak.options.length > WIDE_GROUP && 'col-span-2'
            )}
          >
            <span id={labelId} className="text-xs text-muted-foreground lg:text-[13px]">
              {tweak.label}
            </span>
            <TweakSegments
              tweak={tweak}
              onChange={onChange}
              disabled={disabled}
              labelledBy={labelId}
              className="w-full lg:w-fit"
              itemClassName="flex-1 shrink lg:flex-none"
            />
          </div>
        );
      })}
      {onReset && (
        <>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            aria-label="Wie entworfen"
            title="Wie entworfen"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 max-lg:hidden"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="absolute right-[18px] top-2 py-1 text-xs text-primary hover:underline disabled:opacity-50 lg:hidden"
          >
            Wie entworfen
          </button>
        </>
      )}
    </div>
  );
}

interface SharepicFinishSheetProps extends FinishProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Every axis, colour included, as a bottom sheet for phones. */
export function SharepicFinishSheet({
  open,
  onOpenChange,
  tweaks,
  onChange,
  onReset,
  disabled,
}: SharepicFinishSheetProps) {
  const baseId = useId();
  const farbe = tweaks.find((t) => t.id === 'farbe') ?? null;
  const axes = tweaks.filter((t) => t.id !== 'farbe');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 rounded-t-[20px] bg-card px-[18px] pb-6 pt-2"
      >
        <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-9 rounded-full bg-border" />
        <div className="mb-3 flex items-center gap-2">
          <SheetTitle className="text-base">Feinschliff</SheetTitle>
          <SheetDescription className="sr-only">
            Gestaltung des Sharepics ändern, ohne die KI
          </SheetDescription>
          <div className="ml-auto flex items-center gap-3">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                disabled={disabled}
                className="min-h-11 text-[13px] text-primary disabled:opacity-50"
              >
                Wie entworfen
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-11 min-w-11 text-[13px] font-bold text-foreground"
            >
              Fertig
            </button>
          </div>
        </div>
        {farbe && (
          <div className="mb-[18px]">
            <SharepicSwatches
              tweak={farbe}
              onChange={onChange}
              disabled={disabled}
              size="lg"
              tone="surface"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">
          {axes.map((tweak) => {
            const labelId = `${baseId}-${tweak.id}`;
            return (
              <div
                key={tweak.id}
                className={cn(
                  'flex min-w-0 flex-col gap-1.5',
                  tweak.options.length > WIDE_GROUP && 'col-span-2'
                )}
              >
                <span id={labelId} className="text-xs text-muted-foreground">
                  {tweak.label}
                </span>
                <TweakSegments
                  tweak={tweak}
                  onChange={onChange}
                  disabled={disabled}
                  labelledBy={labelId}
                  className="w-full"
                  itemClassName="min-h-11 flex-1 shrink px-0.5 text-xs"
                />
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
