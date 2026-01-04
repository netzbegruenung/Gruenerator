import { FaExpand, FaUndo } from 'react-icons/fa';
import './DreizeilenPositionSection.css';

export interface DreizeilenPositionSectionProps {
  widthScale: number;
  onWidthScaleChange: (value: number) => void;
  onReset: () => void;
}

export function DreizeilenPositionSection({
  widthScale,
  onWidthScaleChange,
  onReset,
}: DreizeilenPositionSectionProps) {
  return (
    <div className="dreizeilen-position-section">
      <div className="position-control">
        <div className="position-control__header">
          <FaExpand className="position-control__icon" />
          <span className="position-control__label">Balken Breite</span>
        </div>
        <div className="position-control__slider-row">
          <span className="position-control__bound">Schmal</span>
          <input
            id="balken-width"
            type="range"
            min={0.7}
            max={1.3}
            step={0.05}
            value={widthScale}
            onChange={(e) => onWidthScaleChange(Number(e.target.value))}
            className="position-control__slider"
          />
          <span className="position-control__bound">Breit</span>
        </div>
        <div className="position-control__value">{Math.round(widthScale * 100)}%</div>
      </div>

      <button
        type="button"
        className="position-reset-btn"
        onClick={onReset}
      >
        <FaUndo size={12} />
        <span>Zurücksetzen</span>
      </button>
    </div>
  );
}
