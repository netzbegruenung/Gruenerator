import { type FreeBackground } from '@gruenerator/shared/profilbild';
import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { useId } from 'react';
import { PiArrowDown, PiArrowDownRight, PiArrowRight, PiPlus } from 'react-icons/pi';

import { flatCss } from '../utils/profilbildBackgrounds';

import { TOOL_PILL } from './ToolUi';

import { cn } from '@/utils/cn';

const DIRECTIONS = [
  { angle: 180, label: 'Von oben nach unten', Icon: PiArrowDown },
  { angle: 135, label: 'Diagonal', Icon: PiArrowDownRight },
  { angle: 90, label: 'Von links nach rechts', Icon: PiArrowRight },
] as const;

const QUICK_CLASS =
  'size-7 shrink-0 cursor-pointer rounded-full border border-grey-300 outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1 aria-pressed:ring-2 aria-pressed:ring-primary-600 aria-pressed:ring-offset-1 dark:border-grey-600';

/** Eine Farbe: die CD-Farben des Landes als Schnellwahl, daneben der freie Farbwähler. */
function ColorField({
  label,
  value,
  palette,
  onChange,
}: {
  label: string;
  value: string;
  palette: { hex: string; label: string }[];
  onChange: (hex: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={inputId} className="text-xs font-semibold text-grey-600 dark:text-grey-300">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-xs">
        {palette.map((c) => (
          <button
            key={c.hex}
            type="button"
            aria-label={c.label}
            title={c.label}
            aria-pressed={value.toLowerCase() === c.hex.toLowerCase()}
            onClick={() => onChange(c.hex.toLowerCase())}
            className={QUICK_CLASS}
            style={{ background: c.hex }}
          />
        ))}
        <input
          id={inputId}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="h-7 w-10 cursor-pointer rounded border border-grey-300 bg-transparent p-0 dark:border-grey-600"
        />
      </div>
    </div>
  );
}

/**
 * Kachel „Eigene Farbe“ bzw. „Eigener Verlauf“ am Ende ihrer Reihe. Sie zeigt die
 * freie Wahl, sobald es eine gibt; der Wähler bietet die CD-Farben zuerst an.
 */
export function ProfilbildFreeColor({
  mode,
  value,
  pressed,
  palette,
  tileClassName,
  onChange,
}: {
  mode: 'color' | 'gradient';
  /** Die aktuelle freie Wahl, wenn sie zu diesem Modus passt. */
  value: FreeBackground | null;
  pressed: boolean;
  palette: { hex: string; label: string }[];
  tileClassName: string;
  onChange: (bg: FreeBackground) => void;
}) {
  const label = mode === 'color' ? 'Eigene Farbe' : 'Eigener Verlauf';
  const first = palette[0]?.hex ?? '#005538';
  const second = palette[1]?.hex ?? '#ffffff';
  const color = value?.kind === 'color' ? value.color : first;
  const gradient =
    value?.kind === 'gradient'
      ? value
      : { kind: 'gradient' as const, stops: [first, second], angle: 180 };
  const [from = first, to = second] = gradient.stops;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={pressed}
          // Eine schon gewählte freie Farbe gilt beim Antippen wieder.
          onClick={() => value && onChange(value)}
          className={cn(tileClassName, 'flex items-center justify-center')}
          style={
            value
              ? { background: flatCss(value) }
              : {
                  background:
                    'conic-gradient(#e40303, #ff8c00, #ffed00, #008026, #24408e, #732982, #e40303)',
                }
          }
        >
          {!value && (
            <span className="flex size-6 items-center justify-center rounded-full bg-white/90 text-grey-800">
              <PiPlus aria-hidden className="size-4" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-md">
        <p className="m-0 text-sm font-semibold text-foreground-heading">{label}</p>
        {mode === 'color' ? (
          <ColorField
            label="Farbe"
            value={color}
            palette={palette}
            onChange={(hex) => onChange({ kind: 'color', color: hex })}
          />
        ) : (
          <>
            <ColorField
              label="Von"
              value={from}
              palette={palette}
              onChange={(hex) => onChange({ ...gradient, stops: [hex, to] })}
            />
            <ColorField
              label="Nach"
              value={to}
              palette={palette}
              onChange={(hex) => onChange({ ...gradient, stops: [from, hex] })}
            />
            <div role="group" aria-label="Richtung" className="flex gap-xs">
              {DIRECTIONS.map(({ angle, label: dirLabel, Icon }) => (
                <button
                  key={angle}
                  type="button"
                  aria-label={dirLabel}
                  title={dirLabel}
                  aria-pressed={gradient.angle === angle}
                  onClick={() => onChange({ ...gradient, angle })}
                  className={cn(TOOL_PILL, 'px-sm')}
                >
                  <Icon aria-hidden className="size-4" />
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
