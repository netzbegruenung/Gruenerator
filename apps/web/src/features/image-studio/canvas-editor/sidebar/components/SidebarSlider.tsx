import * as Slider from '@radix-ui/react-slider';
import * as React from 'react';

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
  const handleValueChange = (values: number[]) => {
    onValueChange(values[0]);
  };

  return (
    <div className="flex flex-col gap-xxs w-full">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[9px] font-normal">{label}</span>
          {showValue && (
            <span className="text-[9px] font-medium tabular-nums">
              {unit === '%' ? Math.round(value * 100) : value}
              {unit}
            </span>
          )}
        </div>
      )}
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-4"
        value={[value]}
        onValueChange={handleValueChange}
        min={min}
        max={max}
        step={step}
      >
        <Slider.Track className="relative grow rounded-full h-[3px] bg-grey-200 dark:bg-grey-800">
          <Slider.Range className="absolute rounded-full h-full bg-primary-500" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-3 bg-white rounded-[10px] shadow-[0_1px_4px_rgba(0,0,0,0.2)] cursor-pointer border-[1.5px] border-primary-500 transition-[transform,background-color] duration-100 hover:scale-110 hover:bg-primary-50 focus:outline-none focus:shadow-[0_0_0_3px_rgba(70,150,43,0.2)] dark:bg-grey-900 dark:border-primary-400"
          aria-label={label || 'Slider'}
        />
      </Slider.Root>
    </div>
  );
}
