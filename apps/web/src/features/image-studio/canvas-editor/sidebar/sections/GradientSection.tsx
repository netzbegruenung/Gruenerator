import type { GradientSectionProps } from '../types';
import './GradientSection.css';

export function GradientSection({
  enabled,
  onToggle,
  opacity = 0.5,
  onOpacityChange,
}: GradientSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--gradient">
      <label className="gradient-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="gradient-toggle__checkbox"
        />
        <span className="gradient-toggle__label">Gradient-Overlay</span>
      </label>

      {enabled && onOpacityChange && (
        <div className="gradient-opacity">
          <label className="gradient-opacity__label">
            Stärke
            <div className="gradient-opacity__slider-row">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={opacity}
                onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                className="gradient-opacity__slider"
              />
              <span className="gradient-opacity__value">{Math.round(opacity * 100)}%</span>
            </div>
          </label>
        </div>
      )}

      <p className="gradient-section__hint">
        Der Gradient verbessert die Lesbarkeit des Textes auf dem Hintergrundbild.
      </p>
    </div>
  );
}
