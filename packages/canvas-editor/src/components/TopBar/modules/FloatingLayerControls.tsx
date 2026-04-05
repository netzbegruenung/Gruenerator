import React from 'react';
import { PiStackPlus, PiStackMinus } from 'react-icons/pi';

const iconBtn =
  'size-8 max-canvas-mobile:size-11 rounded-full max-canvas-mobile:rounded-[10px] border-none bg-transparent cursor-pointer flex items-center justify-center text-foreground transition-[background-color,color] duration-200 hover:enabled:bg-hover-alt hover:enabled:text-primary-600 active:enabled:bg-grey-100 active:enabled:dark:bg-grey-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:text-grey-400';

interface FloatingLayerControlsProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export const FloatingLayerControls: React.FC<FloatingLayerControlsProps> = ({
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}) => {
  return (
    <div className="flex items-center gap-1">
      <button
        className={iconBtn}
        onClick={onMoveUp}
        disabled={!canMoveUp}
        title="Ebene nach oben"
        aria-label="Ebene nach oben"
      >
        <PiStackPlus />
      </button>
      <button
        className={iconBtn}
        onClick={onMoveDown}
        disabled={!canMoveDown}
        title="Ebene nach unten"
        aria-label="Ebene nach unten"
      >
        <PiStackMinus />
      </button>
    </div>
  );
};
