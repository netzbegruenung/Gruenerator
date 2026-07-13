import * as Slider from '@radix-ui/react-slider';
import React from 'react';
import { PiCircleHalf } from 'react-icons/pi';

interface FloatingBlurControlProps {
  blur: number;
  onBlurChange: (blur: number) => void;
}

// avnac caps its image blur at ~28px; match that here.
const MAX_BLUR = 28;

export function FloatingBlurControl({ blur, onBlurChange }: FloatingBlurControlProps) {
  return (
    <div className="flex items-center gap-2 h-full shrink-0 text-[var(--editor-text)] px-1">
      <PiCircleHalf size={15} className="text-[var(--editor-text-muted)]" title="Weichzeichner" />
      <Slider.Root
        className="relative flex items-center select-none touch-none w-20 h-5 max-canvas-mobile:w-16"
        value={[blur]}
        onValueChange={(v) => onBlurChange(v[0])}
        min={0}
        max={MAX_BLUR}
        step={1}
      >
        <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
          <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-3.5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none"
          aria-label="Weichzeichner"
        />
      </Slider.Root>
      <span className="text-[11px] font-medium w-[26px] text-right tabular-nums text-[var(--editor-text-muted)]">
        {Math.round(blur)}
      </span>
    </div>
  );
}
