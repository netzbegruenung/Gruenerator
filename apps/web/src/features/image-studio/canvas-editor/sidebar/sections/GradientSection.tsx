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
            <div className="sidebar-slider-row">
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={opacity}
                onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                className="sidebar-slider"
              />
              <span className="sidebar-slider-value">{Math.round(opacity * 100)}%</span>
            </div>
          </label>
        </div>
      )}

      <p className="sidebar-hint">
        Der Gradient-Overlay legt eine halbtransparente Schicht über das Hintergrundbild. Dies verbessert die Lesbarkeit des Textes, besonders bei kontrastarmen Bildern. Passe die Stärke nach Bedarf an.
      </p>
    </div>
  );
}
