import * as Slider from '@radix-ui/react-slider';
import React from 'react';
import { PiDrop } from 'react-icons/pi';

interface FloatingOpacityControlProps {
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export function FloatingOpacityControl({ opacity, onOpacityChange }: FloatingOpacityControlProps) {
  const handleValueChange = (values: number[]) => {
    onOpacityChange(values[0]);
  };

  return (
    <div className="flex items-center gap-2 h-full shrink-0 text-[var(--editor-text)] px-1">
      <PiDrop size={15} className="text-[var(--editor-text-muted)]" />
      <Slider.Root
        className="relative flex items-center select-none touch-none w-20 h-5 max-canvas-mobile:w-16"
        value={[opacity]}
        onValueChange={handleValueChange}
        min={0}
        max={1}
        step={0.01}
      >
        <Slider.Track className="relative grow rounded-full h-1 bg-[var(--editor-border-soft)]">
          <Slider.Range className="absolute rounded-full h-full bg-[var(--editor-accent)]" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-3.5 bg-white rounded-full border-2 border-[var(--editor-accent)] shadow-[0_1px_3px_rgba(0,0,0,0.2)] cursor-grab focus:outline-none focus:shadow-[0_0_0_3px_rgba(82,144,122,0.35)]"
          aria-label="Opacity"
        />
      </Slider.Root>
      <span className="text-[11px] font-medium w-[30px] text-right tabular-nums text-[var(--editor-text-muted)]">
        {Math.round(opacity * 100)}%
      </span>
    </div>
  );
}
