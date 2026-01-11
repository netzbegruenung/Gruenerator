/**
 * Plan Mode Toggle Component
 * Toggle switch to enable/disable Plan Mode
 */

import React from 'react';
import { HiAnnotation } from 'react-icons/hi';

export interface PlanModeToggleProps {
  isActive: boolean;
  onToggle: (checked: boolean) => void;
}

const PlanModeToggle: React.FC<PlanModeToggleProps> = ({
  isActive,
  onToggle
}) => {
  return (
    <div className="interactive-mode-toggle">
      <label className="toggle-container">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => onToggle(e.target.checked)}
          className="toggle-input"
        />
        <span className="toggle-slider" />
        <span className="toggle-label">
          <HiAnnotation className="toggle-icon" />
          Plan-Modus
        </span>
      </label>
      <p className="toggle-description">
        KI erstellt erst einen Plan, stellt Verständnisfragen, und generiert dann
      </p>
    </div>
  );
};

export default PlanModeToggle;
