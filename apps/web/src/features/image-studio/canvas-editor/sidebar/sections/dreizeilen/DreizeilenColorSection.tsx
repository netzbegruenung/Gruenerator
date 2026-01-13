import { FaCheck } from 'react-icons/fa';
import type { ColorScheme } from '../../../utils/dreizeilenLayout';
import { SidebarHint } from '../../components/SidebarHint';
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
    <div className="sidebar-section sidebar-section--dreizeilen-color">
      <div className="sidebar-card-grid">
        {colorSchemes.map((scheme) => {
          const isActive = activeSchemeId === scheme.id;
          return (
            <button
              key={scheme.id}
              className={`sidebar-selectable-card sidebar-selectable-card--with-label ${isActive ? 'sidebar-selectable-card--active' : ''}`}
              onClick={() => onSchemeChange(scheme.id)}
              type="button"
              title={scheme.label}
            >
              <div className="color-scheme-preview">
                {scheme.colors.map((color, i) => (
                  <span
                    key={i}
                    className="color-scheme-preview__bar"
                    style={{ backgroundColor: color.background }}
                  />
                ))}
              </div>
              <span className="sidebar-selectable-card__label">{scheme.label}</span>
              {isActive && (
                <span className="sidebar-selectable-card__check">
                  <FaCheck size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <SidebarHint>
        Wähle ein Farbschema, das die Lesbarkeit deiner Balken optimiert. Die Vorschau zeigt dir, wie die drei Balken eingefärbt werden. Achte auf guten Kontrast zwischen Balkenfarbe und Text.
      </SidebarHint>
    </div>
  );
}
