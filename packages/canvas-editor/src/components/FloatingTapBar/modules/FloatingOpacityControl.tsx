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
    <div className="flex items-center gap-2 h-full text-foreground pl-1 pr-1 max-canvas-mobile:gap-1 max-canvas-mobile:pl-0.5 max-canvas-mobile:pr-0.5">
      <PiDrop size={14} className="text-foreground-muted" />
      <Slider.Root
        className="relative flex items-center select-none touch-none w-20 h-5 max-canvas-mobile:w-[30px]"
        value={[opacity]}
        onValueChange={handleValueChange}
        min={0}
        max={1}
        step={0.01}
      >
        <Slider.Track className="relative grow rounded-full h-[3px] bg-grey-200 dark:bg-white/20">
          <Slider.Range className="absolute rounded-full h-full bg-primary-600" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-3 bg-white rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.05)] cursor-grab focus:outline-none focus:shadow-[0_0_0_2px_rgba(108,205,135,0.5)]"
          aria-label="Opacity"
        />
      </Slider.Root>
      <span className="text-[11px] font-medium w-[30px] text-right tabular-nums">
        {Math.round(opacity * 100)}%
      </span>
    </div>
  );
}
