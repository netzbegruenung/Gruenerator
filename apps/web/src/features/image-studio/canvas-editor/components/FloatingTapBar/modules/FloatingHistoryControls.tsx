import React from 'react';
import { PiArrowCounterClockwise, PiArrowClockwise } from 'react-icons/pi';
import '../FloatingTapBar.css';

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
    <div className="floating-history-controls">
      <button
        className="floating-icon-btn"
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
        className="floating-icon-btn"
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
