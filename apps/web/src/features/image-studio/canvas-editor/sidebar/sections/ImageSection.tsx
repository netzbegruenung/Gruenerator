import { HiRefresh } from 'react-icons/hi';
import type { ImageSectionProps } from '../types';
import './ImageSection.css';

export function ImageSection({
  scale,
  onScaleChange,
  onReset,
}: ImageSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--image">
      <div className="image-section__controls">
        <label className="image-section__label">
          Zoom
          <div className="sidebar-slider-row">
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => onScaleChange(parseFloat(e.target.value))}
              className="sidebar-slider"
            />
            <span className="sidebar-slider-value">{Math.round(scale * 100)}%</span>
          </div>
        </label>

        <button
          type="button"
          className="sidebar-reset-btn"
          onClick={onReset}
          title="Position zurücksetzen"
        >
          <HiRefresh size={16} />
          Zurücksetzen
        </button>
      </div>

      <p className="sidebar-hint">
        Klicke auf das Bild und ziehe es, um die Position anzupassen. Mit dem Zoom-Regler kannst du den Bildausschnitt vergrößern oder verkleinern. Achte darauf, dass wichtige Bildelemente sichtbar bleiben.
      </p>
    </div>
  );
}
