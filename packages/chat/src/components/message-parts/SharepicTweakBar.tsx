import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@gruenerator/ui';
import { RotateCcw } from 'lucide-react';

import { type SharepicDesignTweak } from '../../lib/sharepicDesign';
import { cn } from '../../lib/utils';

interface SharepicTweakBarProps {
  tweaks: SharepicDesignTweak[];
  onChange: (id: string, value: string) => void;
  /** Set once the person has switched something: offers the draft back. */
  onReset: (() => void) | null;
  disabled: boolean;
  /** Card width: smaller controls, left-aligned. */
  compact?: boolean;
}

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

/**
 * The design variations of the draft on screen, as the "theme" menu of a
 * design tool: same content, another look, switched without the AI.
 */
export function SharepicTweakBar({
  tweaks,
  onChange,
  onReset,
  disabled,
  compact = false,
}: SharepicTweakBarProps) {
  if (!tweaks.length) return null;
  return (
    <div
      role="group"
      aria-label="Gestaltung"
      className={cn(
        'flex w-full shrink-0 flex-wrap items-center gap-x-4 gap-y-2',
        compact ? 'justify-start' : 'max-w-[960px] justify-center'
      )}
    >
      {tweaks.map((tweak) =>
        tweak.id === 'farbe' ? (
          <div
            key={tweak.id}
            role="radiogroup"
            aria-label={tweak.label}
            className="flex items-center gap-1.5"
          >
            <span className="text-xs text-foreground-muted">{tweak.label}</span>
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
                    compact ? 'size-6' : 'size-7',
                    'rounded-full border border-grey-300 p-[3px] transition-shadow disabled:cursor-not-allowed disabled:opacity-40 dark:border-grey-600',
                    checked && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                  )}
                >
                  <Swatch colors={option.swatch ?? []} />
                </button>
              );
            })}
          </div>
        ) : (
          <label key={tweak.id} className="flex items-center gap-1.5">
            <span className="text-xs text-foreground-muted">{tweak.label}</span>
            <Select
              value={tweak.value ?? ''}
              onValueChange={(value) => onChange(tweak.id, value)}
              disabled={disabled}
            >
              <SelectTrigger size="sm" aria-label={tweak.label} className="bg-background">
                <SelectValue placeholder="Gemischt" />
              </SelectTrigger>
              <SelectContent>
                {tweak.options.map((option) => (
                  <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )
      )}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-foreground-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Wie entworfen
        </button>
      )}
    </div>
  );
}
