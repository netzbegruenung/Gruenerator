import React from 'react';
import { PiStackPlus, PiStackMinus } from 'react-icons/pi';

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
        <div className="floating-layer-controls">
            <button
                className="floating-icon-btn"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                title="Ebene nach oben"
                aria-label="Ebene nach oben"
            >
                <PiStackPlus />
            </button>
            <button
                className="floating-icon-btn"
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
