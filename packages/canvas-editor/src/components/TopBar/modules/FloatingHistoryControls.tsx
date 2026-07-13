import React from 'react';
import { PiArrowCounterClockwise, PiArrowClockwise } from 'react-icons/pi';

const iconBtnLight =
  'size-8 max-canvas-mobile:size-11 rounded-full max-canvas-mobile:rounded-[10px] border-none bg-transparent cursor-pointer flex items-center justify-center text-foreground transition-[background-color,color] duration-200 hover:enabled:bg-hover-alt hover:enabled:text-primary-600 active:enabled:bg-grey-100 active:enabled:dark:bg-grey-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:text-grey-400';

// On the green menu bar: white glyphs, translucent-white hover.
const iconBtnDark =
  'size-[34px] max-canvas-mobile:size-8 rounded-[10px] border-none bg-transparent cursor-pointer flex items-center justify-center text-white/90 transition-[background-color,color] duration-200 hover:enabled:bg-white/15 hover:enabled:text-white active:enabled:bg-white/25 disabled:opacity-40 disabled:cursor-not-allowed';

interface FloatingHistoryControlsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Render for the green menu bar (white-on-green) instead of a light surface. */
  onDark?: boolean;
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

export function FloatingHistoryControls({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDark,
}: FloatingHistoryControlsProps) {
  const iconBtn = onDark ? iconBtnDark : iconBtnLight;
  return (
    <div className="flex items-center gap-1 max-canvas-mobile:gap-0.5">
      <button
        className={iconBtn}
        onClick={(e) => {
          e.stopPropagation();
          onUndo();
        }}
        disabled={!canUndo}
        title={isMac ? 'Rückgängig (⌘Z)' : 'Rückgängig (Strg+Z)'}
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
        title={isMac ? 'Wiederholen (⌘⇧Z)' : 'Wiederholen (Strg+Y)'}
        type="button"
      >
        <PiArrowClockwise size={20} />
      </button>
    </div>
  );
}
