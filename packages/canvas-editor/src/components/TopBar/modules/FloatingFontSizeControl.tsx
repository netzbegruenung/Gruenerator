import React from 'react';
import { FaPlus, FaMinus } from 'react-icons/fa';

const fontBtn =
  'size-7 rounded-md border-none bg-transparent cursor-pointer flex items-center justify-center text-[var(--editor-text-secondary)] transition-colors duration-150 hover:enabled:bg-[var(--editor-surface-hover)] hover:enabled:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

interface FloatingFontSizeControlProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function FloatingFontSizeControl({
  fontSize,
  onFontSizeChange,
}: FloatingFontSizeControlProps) {
  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFontSizeChange(fontSize + 2);
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFontSizeChange(Math.max(2, fontSize - 2));
  };

  return (
    <div className="flex items-center h-[34px] shrink-0 rounded-lg border border-[var(--editor-border-strong)] px-0.5">
      <button
        className={fontBtn}
        onClick={handleDecrease}
        title="Schrift verkleinern"
        type="button"
      >
        <FaMinus size={10} />
      </button>
      <span className="text-[13px] font-semibold text-[var(--editor-text)] min-w-8 text-center tabular-nums">
        {Math.round(fontSize)}
      </span>
      <button className={fontBtn} onClick={handleIncrease} title="Schrift vergrößern" type="button">
        <FaPlus size={10} />
      </button>
    </div>
  );
}
