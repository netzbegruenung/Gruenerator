import * as Slider from '@radix-ui/react-slider';
import * as React from 'react';
import './SidebarSlider.css';

interface SidebarSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  showValue?: boolean;
}

export function SidebarSlider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  unit = '',
  showValue = true,
}: SidebarSliderProps) {
  // Radix Slider value must be an array
  const handleValueChange = (values: number[]) => {
    onValueChange(values[0]);
  };

  return (
    <div className="sidebar-slider-container">
      {label && (
        <div className="sidebar-slider-header">
          <span className="sidebar-slider-label">{label}</span>
          {showValue && (
            <span className="sidebar-slider-display">
              {unit === '%' ? Math.round(value * 100) : value}
              {unit}
            </span>
          )}
        </div>
      )}
      <Slider.Root
        className="SliderRoot"
        value={[value]}
        onValueChange={handleValueChange}
        min={min}
        max={max}
        step={step}
      >
        <Slider.Track className="SliderTrack">
          <Slider.Range className="SliderRange" />
        </Slider.Track>
        <Slider.Thumb className="SliderThumb" aria-label={label || 'Slider'} />
      </Slider.Root>
    </div>
  );
}
