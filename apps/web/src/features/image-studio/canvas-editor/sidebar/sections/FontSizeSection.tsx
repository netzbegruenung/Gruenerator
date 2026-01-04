import { FaMinus, FaPlus } from 'react-icons/fa';
import type { FontSizeSectionProps } from '../types';
import './FontSizeSection.css';

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
    <div className="font-size-stepper">
      <button
        type="button"
        className="font-size-stepper__btn"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label="Schriftgröße verringern"
      >
        <FaMinus size={12} />
      </button>
      <input
        type="number"
        className="font-size-stepper__input"
        value={Math.round(value)}
        onChange={handleInputChange}
        min={min}
        max={max}
      />
      <button
        type="button"
        className="font-size-stepper__btn"
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
    <div className="sidebar-section sidebar-section--fontsize">
      {quoteFontSize !== undefined && onQuoteFontSizeChange && (
        <FontSizeStepper value={quoteFontSize} onChange={onQuoteFontSizeChange} />
      )}
      {nameFontSize !== undefined && onNameFontSizeChange && (
        <FontSizeStepper value={nameFontSize} onChange={onNameFontSizeChange} />
      )}
    </div>
  );
}
