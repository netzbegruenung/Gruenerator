import * as Slider from '@radix-ui/react-slider';
import React from 'react';
import { PiDrop } from 'react-icons/pi';
import './FloatingOpacityControl.css';

interface FloatingOpacityControlProps {
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export function FloatingOpacityControl({ opacity, onOpacityChange }: FloatingOpacityControlProps) {
  const handleValueChange = (values: number[]) => {
    onOpacityChange(values[0]);
  };

  return (
    <div className="floating-opacity-control">
      <PiDrop size={14} className="floating-opacity-icon" />
      <Slider.Root
        className="FloatingSliderRoot"
        value={[opacity]}
        onValueChange={handleValueChange}
        min={0}
        max={1}
        step={0.01}
      >
        <Slider.Track className="FloatingSliderTrack">
          <Slider.Range className="FloatingSliderRange" />
        </Slider.Track>
        <Slider.Thumb className="FloatingSliderThumb" aria-label="Opacity" />
      </Slider.Root>
      <span className="floating-opacity-val">{Math.round(opacity * 100)}%</span>
    </div>
  );
}
