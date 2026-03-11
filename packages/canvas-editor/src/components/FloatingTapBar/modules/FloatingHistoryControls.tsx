import React from 'react';
import { PiArrowCounterClockwise, PiArrowClockwise } from 'react-icons/pi';

const iconBtn =
  'size-8 max-canvas-mobile:size-11 rounded-full max-canvas-mobile:rounded-[10px] border-none bg-transparent cursor-pointer flex items-center justify-center text-foreground transition-[background-color,color] duration-200 hover:enabled:bg-hover-alt hover:enabled:text-primary-600 active:enabled:bg-grey-100 active:enabled:dark:bg-grey-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:text-grey-400';

interface FloatingHistoryControlsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function FloatingHistoryControls({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: FloatingHistoryControlsProps) {
  return (
    <div className="flex items-center gap-1 max-canvas-mobile:gap-0.5">
      <button
        className={iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onUndo();
        }}
        disabled={!canUndo}
        title="Rückgängig"
        type="button"
      >
        <PiArrowCounterClockwise size={20} />
      </button>
      <button
        className={iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onRedo();
        }}
        disabled={!canRedo}
        title="Wiederholen"
        type="button"
      >
        <PiArrowClockwise size={20} />
      </button>
    </div>
  );
}
