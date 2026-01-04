import { FaCheck } from 'react-icons/fa';
import type { BackgroundSectionProps } from '../types';
import './BackgroundSection.css';

export function BackgroundSection({
  colors,
  currentColor,
  onColorChange,
}: BackgroundSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--background">
      <div className="background-grid">
        {colors.map((option) => {
          const isActive = currentColor === option.color;
          return (
            <button
              key={option.id}
              className="background-card"
              onClick={() => onColorChange(option.color)}
              type="button"
              title={option.label}
            >
              <div className="background-card__preview">
                <span
                  className="background-card__color"
                  style={{ backgroundColor: option.color }}
                />
                {isActive && (
                  <span className="background-card__check">
                    <FaCheck size={8} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
