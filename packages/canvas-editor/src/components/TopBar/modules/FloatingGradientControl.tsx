import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import * as Slider from '@radix-ui/react-slider';
import React from 'react';
import { PiPaintBucket } from 'react-icons/pi';

import { BRAND_COLORS } from '../../../utils/shapes';
import { createDefaultGradient, type GradientFill } from '../../../utils/gradientFill';

interface FloatingGradientControlProps {
  currentColor: string;
  gradient?: GradientFill | null;
  onChange: (gradient: GradientFill | null) => void;
}

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]';

function StopSwatches({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BRAND_COLORS.map((c) => (
        <button
          key={c.id}
          className="size-5 rounded-full border border-black/10 hover:scale-110 transition-transform"
          style={{
            backgroundColor: c.value,
            outline: selected === c.value ? '2px solid var(--editor-accent)' : 'none',
            outlineOffset: '1px',
          }}
          onClick={() => onSelect(c.value)}
          title={c.name}
          type="button"
        />
      ))}
    </div>
  );
}

export function FloatingGradientControl({
  currentColor,
  gradient,
  onChange,
}: FloatingGradientControlProps) {
  const active = !!gradient;
  const g = gradient ?? createDefaultGradient(currentColor);
  const stop0 = g.stops[0]?.color ?? currentColor;
  const stop1 = g.stops[1]?.color ?? '#ffffff';

  const setStop = (index: 0 | 1, color: string) => {
    const stops = g.stops.map((s, i) => (i === index ? { ...s, color } : s));
    onChange({ ...g, stops });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={ICON_BTN}
          title="Farbverlauf"
          type="button"
          aria-label="Farbverlauf bearbeiten"
        >
          <PiPaintBucket
            size={17}
            className={active ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-text-muted)]'}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[10001] w-64 flex flex-col gap-3 p-3" align="center">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--editor-text)]">Farbverlauf</span>
          {active ? (
            <button
              className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
              onClick={() => onChange(null)}
              type="button"
            >
              Entfernen
            </button>
          ) : (
            <button
              className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
              onClick={() => onChange(createDefaultGradient(currentColor))}
              type="button"
            >
              Aktivieren
            </button>
          )}
        </div>

        {active && (
          <>
            <div
              className="h-6 w-full rounded-md border border-black/10"
              style={{ background: `linear-gradient(${g.angle}deg, ${stop0}, ${stop1})` }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--editor-text-muted)]">Farbe 1</span>
              <StopSwatches selected={stop0} onSelect={(c) => setStop(0, c)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--editor-text-muted)]">Farbe 2</span>
              <StopSwatches selected={stop1} onSelect={(c) => setStop(1, c)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] w-12 text-[var(--editor-text-muted)]">Winkel</span>
              <Slider.Root
                className="relative flex items-center select-none touch-none grow h-4"
                value={[g.angle]}
                onValueChange={(v) => onChange({ ...g, angle: v[0] })}
                min={0}
                max={360}
                step={5}
              >
                <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
                  <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
                </Slider.Track>
                <Slider.Thumb
                  className="block size-3 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
                  aria-label="Winkel"
                />
              </Slider.Root>
              <span className="text-[11px] w-9 text-right tabular-nums text-[var(--editor-text-muted)]">
                {g.angle}°
              </span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
