import { FaCheck } from 'react-icons/fa';
import type { BackgroundSectionProps } from '../types';
import { SidebarSlider } from '../components/SidebarSlider';
import './BackgroundSection.css';

export function BackgroundSection({
  colors,
  currentColor,
  onColorChange,
  gradientOpacity,
  onGradientOpacityChange,
}: BackgroundSectionProps) {
  const showGradient = gradientOpacity !== undefined && onGradientOpacityChange !== undefined;

  return (
    <div className="sidebar-section sidebar-section--background">
      <div className="sidebar-card-grid">
        {colors.map((option) => {
          const isActive = currentColor === option.color;
          return (
            <button
              key={option.id}
              className={`sidebar-selectable-card ${isActive ? 'sidebar-selectable-card--active' : ''}`}
              onClick={() => onColorChange(option.color)}
              type="button"
              title={option.label}
            >
              <div className="sidebar-selectable-card__preview">
                <span
                  className="background-color-swatch"
                  style={{ backgroundColor: option.color }}
                />
                {isActive && (
                  <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                    <FaCheck size={8} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showGradient && (
        <div style={{ marginTop: 'var(--spacing-large)' }}>
          <SidebarSlider
            label="Gradient-Overlay"
            value={gradientOpacity}
            onValueChange={onGradientOpacityChange}
            min={0}
            max={1}
            step={0.01}
            unit="%"
          />
        </div>
      )}

      <p className="sidebar-hint">
        Wähle eine passende Hintergrundfarbe für dein Design. Die Farbe sollte gut mit dem Text harmonieren und für ausreichend Kontrast sorgen. Sand (hell) eignet sich für dunkle Texte, grüne Töne für helle Texte.
      </p>
    </div>
  );
}
