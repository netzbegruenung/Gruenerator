// SPDX-License-Identifier: MPL-2.0
import { Slider } from 'radix-ui';
import React from 'react';

import { useDocumentBrand } from '@ggraphic/editor/brand/documentBrand';
import { CustomColorSwatch } from '@ggraphic/editor/components/CustomColorSwatch';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { EffectCard } from '@ggraphic/editor/sidebar/sections/effects/EffectCard';
import { colorName } from '@ggraphic/editor/utils/colorNames';

interface OutlineSettingsProps {
  stroke?: string;
  strokeWidth?: number;
  onChange: (patch: { stroke?: string; strokeWidth?: number }) => void;
}

const DEFAULT_WIDTH = 2;

/** Kontur eines freien Textes, im Bereich „Effekte“. */
export function OutlineSettings({ stroke, strokeWidth, onChange }: OutlineSettingsProps) {
  const brand = useDocumentBrand();
  const { outlines } = brand.effects;
  const t = useMessages();
  const enabled = !!stroke && (strokeWidth ?? 0) > 0;

  const toggle = () => {
    if (enabled) {
      onChange({ stroke: undefined, strokeWidth: 0 });
    } else {
      onChange({ stroke: '#ffffff', strokeWidth: DEFAULT_WIDTH });
    }
  };

  return (
    <EffectCard title={t.topBar.outline} enabled={enabled} onToggle={toggle}>
      <div className="flex items-center gap-2">
        {outlines.map((c) => (
          <button
            key={c}
            className="size-6 rounded-full border border-black/10 hover:scale-110 transition-transform"
            style={{
              backgroundColor: c,
              outline: stroke === c ? '2px solid var(--editor-accent)' : 'none',
              outlineOffset: '2px',
            }}
            onClick={() => onChange({ stroke: c })}
            title={colorName(c, brand)}
            aria-label={colorName(c, brand)}
            aria-pressed={stroke === c}
            type="button"
          />
        ))}
        <CustomColorSwatch
          value={stroke}
          presets={outlines}
          onPick={(color) => onChange({ stroke: color })}
          className="size-6"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] w-12 text-[var(--editor-text-muted)]">
          {t.topBar.strength}
        </span>
        <Slider.Root
          className="relative flex items-center select-none touch-none grow h-4 max-canvas-mobile:h-11"
          value={[strokeWidth ?? DEFAULT_WIDTH]}
          onValueChange={(v) => onChange({ strokeWidth: v[0] })}
          min={0.5}
          max={12}
          step={0.5}
        >
          <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
            <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
          </Slider.Track>
          <Slider.Thumb
            className="block size-3 max-canvas-mobile:size-5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
            aria-label={t.topBar.outlineWidth}
          />
        </Slider.Root>
        <span className="text-[11px] w-8 text-right tabular-nums text-[var(--editor-text-muted)]">
          {strokeWidth ?? DEFAULT_WIDTH}
        </span>
      </div>
    </EffectCard>
  );
}
