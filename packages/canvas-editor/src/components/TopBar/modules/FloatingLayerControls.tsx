import React from 'react';
import { PiStackPlus, PiStackMinus } from 'react-icons/pi';

const iconBtn =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:enabled:bg-[var(--editor-surface-hover)] hover:enabled:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

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
    <div className="flex items-center gap-0.5">
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
