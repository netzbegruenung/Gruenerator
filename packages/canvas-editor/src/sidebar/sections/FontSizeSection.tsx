import { FaMinus, FaPlus } from 'react-icons/fa';

import type { FontSizeSectionProps } from '../types';

interface FontSizeStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

function FontSizeStepper({ value, onChange, min = 12, max = 200 }: FontSizeStepperProps) {
  const handleDecrement = () => {
    if (value > min) onChange(value - 1);
  };

  const handleIncrement = () => {
    if (value < max) onChange(value + 1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
      onChange(newValue);
    }
  };

  return (
    <div className="flex items-center gap-0 border-border rounded-lg overflow-hidden bg-background">
      <button
        type="button"
        className="flex items-center justify-center w-[36px] h-[36px] border-none bg-transparent text-foreground cursor-pointer transition-[background-color,color] duration-150 ease-in-out hover:not-disabled:bg-background-alt hover:not-disabled:text-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label="Schriftgröße verringern"
      >
        <FaMinus size={12} />
      </button>
      <input
        type="number"
        className="w-[48px] h-[36px] border-none border-l-[var(--border-subtle)] border-r-[var(--border-subtle)] bg-background-alt text-foreground text-sm font-semibold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:bg-background"
        style={{
          borderLeft: '1px solid var(--color-border)',
          borderRight: '1px solid var(--color-border)',
        }}
        value={Math.round(value)}
        onChange={handleInputChange}
        min={min}
        max={max}
      />
      <button
        type="button"
        className="flex items-center justify-center w-[36px] h-[36px] border-none bg-transparent text-foreground cursor-pointer transition-[background-color,color] duration-150 ease-in-out hover:not-disabled:bg-background-alt hover:not-disabled:text-primary-600 disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={handleIncrement}
        disabled={value >= max}
        aria-label="Schriftgröße erhöhen"
      >
        <FaPlus size={12} />
      </button>
    </div>
  );
}

export function FontSizeSection({
  quoteFontSize,
  nameFontSize,
  onQuoteFontSizeChange,
  onNameFontSizeChange,
}: FontSizeSectionProps) {
  return (
    <div className="sidebar-section flex flex-col gap-sm w-fit max-canvas-mobile:w-full max-canvas-mobile:items-center">
      {quoteFontSize !== undefined && onQuoteFontSizeChange && (
        <FontSizeStepper value={quoteFontSize} onChange={onQuoteFontSizeChange} />
      )}
      {nameFontSize !== undefined && onNameFontSizeChange && (
        <FontSizeStepper value={nameFontSize} onChange={onNameFontSizeChange} />
      )}
    </div>
  );
}
