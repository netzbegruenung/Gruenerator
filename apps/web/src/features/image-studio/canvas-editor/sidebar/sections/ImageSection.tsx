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
      <div className="image-section__info">
        <p className="image-section__hint">
          Ziehe das Bild um es zu verschieben. Nutze den Schieberegler zum Zoomen.
        </p>
      </div>

      <div className="image-section__controls">
        <label className="image-section__label">
          Zoom
          <div className="image-section__slider-row">
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => onScaleChange(parseFloat(e.target.value))}
              className="image-section__slider"
            />
            <span className="image-section__value">{Math.round(scale * 100)}%</span>
          </div>
        </label>

        <button
          type="button"
          className="image-section__reset-btn"
          onClick={onReset}
          title="Position zurücksetzen"
        >
          <HiRefresh size={16} />
          Zurücksetzen
        </button>
      </div>
    </div>
  );
}
