
import { FaUndo } from 'react-icons/fa';
import type { ColorScheme } from '../../../utils/dreizeilenLayout';
import './DreizeilenPositionSection.css';

export interface DreizeilenPositionSectionProps {
  widthScale: number;
  onWidthScaleChange: (value: number) => void;
  barOffsets: [number, number, number];
  onBarOffsetChange: (index: number, value: number) => void;
  colorScheme: ColorScheme;
  onReset: () => void;
}

export function DreizeilenPositionSection({
  widthScale,
  onWidthScaleChange,
  barOffsets,
  onBarOffsetChange,
  colorScheme,
  onReset,
}: DreizeilenPositionSectionProps) {
  const formatOffset = (value: number) => {
    if (value === 0) return '0';
    return value > 0 ? `+ ${value} px` : `${value} px`;
  };

  return (
    <div className="sidebar-section sidebar-section--dreizeilen-position">
      <div className="sidebar-control-group">
        <div className="sidebar-slider-row sidebar-slider-row--with-bounds">
          <span className="sidebar-slider-bound">Schmal</span>
          <input
            id="balken-width"
            type="range"
            min={0.9}
            max={1.1}
            step={0.02}
            value={widthScale}
            onChange={(e) => onWidthScaleChange(Number(e.target.value))}
            className="sidebar-slider sidebar-slider--thick"
          />
          <span className="sidebar-slider-bound">Breit</span>
        </div>
      </div>

      <div className="individual-bar-controls-divider">
        <span>Feinabstimmung</span>
      </div>

      <div className="individual-bar-controls">
        {[0, 1, 2].map((index) => {
          const colorPair = colorScheme.colors[index];
          const staggerOffset = index * 12; // pixels to stagger each bar visually

          return (
            <div key={index} className="bar-control-row">
              <div className="bar-preview-wrapper" style={{ paddingLeft: `${staggerOffset} px` }}>
                <div
                  className="bar-preview"
                  style={{
                    backgroundColor: colorPair.background,
                  }}
                />
              </div>
              <input
                id={`bar - ${index} -offset`}
                type="range"
                min={-200}
                max={200}
                step={5}
                value={barOffsets[index]}
                onChange={(e) => onBarOffsetChange(index, Number(e.target.value))}
                className="bar-slider"
                style={{
                  // @ts-ignore - CSS variable for dynamic theming
                  '--slider-color': colorPair.background
                }}
              />
              <div className="bar-value-badge">{formatOffset(barOffsets[index])}</div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="sidebar-reset-btn"
        onClick={onReset}
      >
        <FaUndo size={12} />
        <span>Zurücksetzen</span>
      </button>

      <p className="sidebar-hint">
        Stelle die Breite aller Balken gemeinsam ein (Schmal bis Breit). Mit der Feinabstimmung kannst du jeden Balken einzeln horizontal verschieben, um interessante Layouts zu erstellen. Die farbigen Vorschauen zeigen, welcher Regler zu welchem Balken gehört.
      </p>
    </div>
  );
}
