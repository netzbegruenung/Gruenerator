import { FaCheck } from 'react-icons/fa';
import type { ColorScheme } from '../../../utils/dreizeilenLayout';
import './DreizeilenColorSection.css';

export interface DreizeilenColorSectionProps {
  colorSchemes: ColorScheme[];
  activeSchemeId: string;
  onSchemeChange: (schemeId: string) => void;
}

export function DreizeilenColorSection({
  colorSchemes,
  activeSchemeId,
  onSchemeChange,
}: DreizeilenColorSectionProps) {
  return (
    <div className="dreizeilen-color-section">
      <div className="color-scheme-grid">
        {colorSchemes.map((scheme) => {
          const isActive = activeSchemeId === scheme.id;
          return (
            <button
              key={scheme.id}
              className={`color-scheme-card ${isActive ? 'color-scheme-card--active' : ''}`}
              onClick={() => onSchemeChange(scheme.id)}
              type="button"
              title={scheme.label}
            >
              <div className="color-scheme-card__preview">
                {scheme.colors.map((color, i) => (
                  <span
                    key={i}
                    className="color-scheme-card__bar"
                    style={{ backgroundColor: color.background }}
                  />
                ))}
              </div>
              <span className="color-scheme-card__label">{scheme.label}</span>
              {isActive && (
                <span className="color-scheme-card__check">
                  <FaCheck size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
