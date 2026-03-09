import React from 'react';
import { FaPlus, FaMinus } from 'react-icons/fa';

const fontBtn =
  'size-6 max-canvas-mobile:size-5 rounded-full border-none bg-transparent cursor-pointer flex items-center justify-center text-foreground transition-[background-color,color] duration-200 hover:enabled:bg-hover-alt hover:enabled:text-primary-600 active:enabled:bg-grey-100 active:enabled:dark:bg-grey-800 disabled:opacity-30 disabled:cursor-not-allowed';

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
    <div className="flex items-center gap-1 bg-grey-100 dark:bg-grey-800 rounded-full py-0.5 px-1 max-canvas-mobile:gap-0.5 max-canvas-mobile:py-0.5 max-canvas-mobile:px-[3px]">
      <button
        className={fontBtn}
        onClick={handleDecrease}
        title="Schrift verkleinern"
        type="button"
      >
        <FaMinus size={10} />
      </button>
      <span className="text-[13px] max-canvas-mobile:text-xs font-semibold text-foreground min-w-6 max-canvas-mobile:min-w-5 text-center tabular-nums">
        {Math.round(fontSize)}
      </span>
      <button className={fontBtn} onClick={handleIncrease} title="Schrift vergrößern" type="button">
        <FaPlus size={10} />
      </button>
    </div>
  );
}
