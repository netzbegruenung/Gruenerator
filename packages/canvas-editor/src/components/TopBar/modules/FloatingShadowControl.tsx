import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import * as Slider from '@radix-ui/react-slider';
import React from 'react';
import { PiDropHalfBottom } from 'react-icons/pi';

import type { ShadowPatch } from '../../../hooks/useFloatingModuleHandlers';

interface FloatingShadowControlProps {
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  onChange: (patch: ShadowPatch) => void;
}

const SHADOW_COLORS = ['#000000', '#316049', '#40200e', '#1f3a5f'];

const SHADOW_DEFAULTS: ShadowPatch = {
  shadowColor: '#000000',
  shadowBlur: 8,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
  shadowOpacity: 0.5,
};

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]';

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onValueChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onValueChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-14 text-[var(--editor-text-muted)]">{label}</span>
      <Slider.Root
        className="relative flex items-center select-none touch-none grow h-4"
        value={[value]}
        onValueChange={(v) => onValueChange(v[0])}
        min={min}
        max={max}
        step={step}
      >
        <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
          <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-3 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
          aria-label={label}
        />
      </Slider.Root>
      <span className="text-[11px] w-9 text-right tabular-nums text-[var(--editor-text-muted)]">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

export function FloatingShadowControl({
  shadowColor,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  shadowOpacity,
  onChange,
}: FloatingShadowControlProps) {
  const enabled = !!shadowColor;

  const toggle = () => {
    if (enabled) {
      onChange({ shadowColor: undefined, shadowBlur: 0, shadowOpacity: 0 });
    } else {
      onChange(SHADOW_DEFAULTS);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={ICON_BTN}
          title="Schatten"
          type="button"
          aria-label="Schatten bearbeiten"
        >
          <PiDropHalfBottom
            size={17}
            className={enabled ? 'text-[var(--editor-accent)]' : 'text-[var(--editor-text-muted)]'}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[10001] w-64 flex flex-col gap-2.5 p-3" align="center">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--editor-text)]">Schatten</span>
          <button
            className="text-[11px] font-medium text-[var(--editor-accent)] hover:underline"
            onClick={toggle}
            type="button"
          >
            {enabled ? 'Entfernen' : 'Aktivieren'}
          </button>
        </div>

        {enabled && (
          <>
            <div className="flex items-center gap-2">
              {SHADOW_COLORS.map((c) => (
                <button
                  key={c}
                  className="size-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: c,
                    outline: shadowColor === c ? '2px solid var(--editor-accent)' : 'none',
                    outlineOffset: '2px',
                  }}
                  onClick={() => onChange({ shadowColor: c })}
                  title={c}
                  type="button"
                />
              ))}
            </div>
            <LabeledSlider
              label="Weichheit"
              value={shadowBlur ?? 0}
              min={0}
              max={40}
              step={1}
              onValueChange={(v) => onChange({ shadowBlur: v })}
            />
            <LabeledSlider
              label="X-Versatz"
              value={shadowOffsetX ?? 0}
              min={-40}
              max={40}
              step={1}
              onValueChange={(v) => onChange({ shadowOffsetX: v })}
            />
            <LabeledSlider
              label="Y-Versatz"
              value={shadowOffsetY ?? 0}
              min={-40}
              max={40}
              step={1}
              onValueChange={(v) => onChange({ shadowOffsetY: v })}
            />
            <LabeledSlider
              label="Deckkraft"
              value={(shadowOpacity ?? 0) * 100}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onValueChange={(v) => onChange({ shadowOpacity: v / 100 })}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
