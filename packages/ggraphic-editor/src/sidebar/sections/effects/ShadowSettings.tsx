// SPDX-License-Identifier: MPL-2.0
import { Slider } from 'radix-ui';
import React from 'react';

import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { EffectCard } from '@ggraphic/editor/sidebar/sections/effects/EffectCard';
import { colorName } from '@ggraphic/editor/utils/colorNames';

import type { ShadowPatch } from '@ggraphic/editor/hooks/useFloatingModuleHandlers';

interface ShadowSettingsProps {
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  onChange: (patch: ShadowPatch) => void;
}

const SHADOW_DEFAULTS: ShadowPatch = {
  shadowColor: '#000000',
  shadowBlur: 8,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
  shadowOpacity: 0.5,
};

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
        className="relative flex items-center select-none touch-none grow h-4 max-canvas-mobile:h-11"
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
          className="block size-3 max-canvas-mobile:size-5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
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

/** Schatten einer Form oder eines freien Textes, im Bereich „Effekte“. */
export function ShadowSettings({
  shadowColor,
  shadowBlur,
  shadowOffsetX,
  shadowOffsetY,
  shadowOpacity,
  onChange,
}: ShadowSettingsProps) {
  const brand = useDocumentBrand();
  const { shadows } = brand.effects;
  const t = useMessages();
  const enabled = !!shadowColor;

  const toggle = () => {
    if (enabled) {
      onChange({ shadowColor: undefined, shadowBlur: 0, shadowOpacity: 0 });
    } else {
      onChange(SHADOW_DEFAULTS);
    }
  };

  return (
    <EffectCard title={t.topBar.shadow} enabled={enabled} onToggle={toggle}>
      <div className="flex items-center gap-2">
        {shadows.map((c) => (
          <button
            key={c}
            className="size-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
            style={{
              backgroundColor: c,
              outline: shadowColor === c ? '2px solid var(--editor-accent)' : 'none',
              outlineOffset: '2px',
            }}
            onClick={() => onChange({ shadowColor: c })}
            title={colorName(c, brand)}
            aria-label={colorName(c, brand)}
            aria-pressed={shadowColor === c}
            type="button"
          />
        ))}
        <CustomColorSwatch
          value={shadowColor}
          presets={shadows}
          onPick={(color) => onChange({ shadowColor: color })}
          className="size-6"
        />
      </div>
      <LabeledSlider
        label={t.sidebar.imageAdjust.softness}
        value={shadowBlur ?? 0}
        min={0}
        max={40}
        step={1}
        onValueChange={(v) => onChange({ shadowBlur: v })}
      />
      <LabeledSlider
        label={t.sidebar.imageAdjust.offsetX}
        value={shadowOffsetX ?? 0}
        min={-40}
        max={40}
        step={1}
        onValueChange={(v) => onChange({ shadowOffsetX: v })}
      />
      <LabeledSlider
        label={t.sidebar.imageAdjust.offsetY}
        value={shadowOffsetY ?? 0}
        min={-40}
        max={40}
        step={1}
        onValueChange={(v) => onChange({ shadowOffsetY: v })}
      />
      <LabeledSlider
        label={t.sidebar.imageAdjust.opacity}
        value={(shadowOpacity ?? 0) * 100}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onValueChange={(v) => onChange({ shadowOpacity: v / 100 })}
      />
    </EffectCard>
  );
}
