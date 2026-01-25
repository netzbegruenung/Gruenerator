import React from 'react';
import { FaPlus, FaMinus } from 'react-icons/fa';
import '../FloatingTapBar.css';

interface FloatingFontSizeControlProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function FloatingFontSizeControl({
  fontSize,
  onFontSizeChange,
}: FloatingFontSizeControlProps) {
  // Hold press handlers could be added for better UX, but simple click for now
  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFontSizeChange(fontSize + 2);
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFontSizeChange(Math.max(2, fontSize - 2));
  };

  return (
    <div className="floating-font-size-control">
      <button
        className="floating-icon-btn floating-font-btn"
        onClick={handleDecrease}
        title="Schrift verkleinern"
        type="button"
      >
        <FaMinus size={10} />
      </button>
      <span className="floating-font-val">{Math.round(fontSize)}</span>
      <button
        className="floating-icon-btn floating-font-btn"
        onClick={handleIncrease}
        title="Schrift vergrößern"
        type="button"
      >
        <FaPlus size={10} />
      </button>
    </div>
  );
}
