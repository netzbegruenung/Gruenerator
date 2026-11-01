// SPDX-License-Identifier: MPL-2.0
import { Slider } from 'radix-ui';
import React, { useId } from 'react';
import { PiPaintBucket } from 'react-icons/pi';

import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { Popover, PopoverContent, PopoverTrigger } from '@ggraphic/editor/ui/popover';
import { brandColors } from '@ggraphic/editor/utils/colorOptions';
import { createDefaultGradient, type GradientFill } from '@ggraphic/editor/utils/gradientFill';

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
  const brand = useDocumentBrand();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {brandColors(brand).map((c) => (
        <button
          key={c.id}
          className="size-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
          style={{
            backgroundColor: c.value,
            outline: selected === c.value ? '2px solid var(--editor-accent)' : 'none',
            outlineOffset: '1px',
          }}
          onClick={() => onSelect(c.value)}
          title={c.name}
          aria-label={c.name}
          aria-pressed={selected === c.value}
          type="button"
        />
      ))}
      <CustomColorSwatch
        value={selected}
        presets={brandColors(brand).map((c) => c.value)}
        onPick={onSelect}
        className="size-5"
        outlineOffset={1}
      />
    </div>
  );
}

export function FloatingGradientControl({
  currentColor,
  gradient,
  onChange,
}: FloatingGradientControlProps) {
  const t = useMessages();
  const active = !!gradient;
  const g = gradient ?? createDefaultGradient(currentColor);
  const stop0 = g.stops[0]?.color ?? currentColor;
  const stop1 = g.stops[1]?.color ?? '#ffffff';

  const setStop = (index: 0 | 1, color: string) => {
    const stops = g.stops.map((s, i) => (i === index ? { ...s, color } : s));
    onChange({ ...g, stops });
  };

  const titleId = useId();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={ICON_BTN}
          title={t.topBar.gradient}
          type="button"
          aria-label={t.topBar.editGradient}
        >
          <PiPaintBucket
            size={17}
            className={active ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-text-muted)]'}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10001] w-64 flex flex-col gap-3 p-3"
        align="center"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between">
          <span id={titleId} className="text-xs font-medium text-[var(--editor-text)]">
            {t.topBar.gradient}
          </span>
          {active ? (
            <button
              className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
              onClick={() => onChange(null)}
              type="button"
            >
              {t.sidebar.imageAdjust.remove}
            </button>
          ) : (
            <button
              className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
              onClick={() => onChange(createDefaultGradient(currentColor))}
              type="button"
            >
              {t.sidebar.imageAdjust.enable}
            </button>
          )}
        </div>

        {active && (
          <>
            <div
              className="h-6 w-full rounded-md border border-black/10"
              style={{
                background:
                  g.type === 'radial'
                    ? `radial-gradient(${stop0}, ${stop1})`
                    : `linear-gradient(${g.angle}deg, ${stop0}, ${stop1})`,
              }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--editor-text-muted)]">Farbe 1</span>
              <StopSwatches selected={stop0} onSelect={(c) => setStop(0, c)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--editor-text-muted)]">Farbe 2</span>
              <StopSwatches selected={stop1} onSelect={(c) => setStop(1, c)} />
            </div>
            {g.type === 'linear' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] w-12 text-[var(--editor-text-muted)]">
                  {t.topBar.angle}
                </span>
                <Slider.Root
                  className="relative flex items-center select-none touch-none grow h-4 max-canvas-mobile:h-11"
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
                    className="block size-3 max-canvas-mobile:size-5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab outline-none kbd:focus-visible:outline-2 kbd:focus-visible:outline-solid kbd:focus-visible:outline-offset-2 kbd:focus-visible:outline-[var(--editor-accent)]"
                    aria-label={t.topBar.angle}
                  />
                </Slider.Root>
                <span className="text-[11px] w-9 text-right tabular-nums text-[var(--editor-text-muted)]">
                  {g.angle}°
                </span>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
