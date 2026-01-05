import { FaCheck } from 'react-icons/fa';
import './DreizeilenAlternativesSection.css';

export interface DreizeilenAlternative {
  line1?: string;
  line2?: string;
  line3?: string;
}

export interface DreizeilenAlternativesSectionProps {
  alternatives: DreizeilenAlternative[];
  currentLine1: string;
  currentLine2: string;
  currentLine3: string;
  onSelectAlternative: (alt: DreizeilenAlternative) => void;
}

export function DreizeilenAlternativesSection({
  alternatives,
  currentLine1,
  currentLine2,
  currentLine3,
  onSelectAlternative,
}: DreizeilenAlternativesSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--dreizeilen-alternatives">
      <div className="sidebar-card-grid">
        {alternatives.map((alt, index) => {
          const altLabel = [alt.line1, alt.line2, alt.line3].filter(Boolean).join(' / ');
          const isActive =
            alt.line1 === currentLine1 &&
            alt.line2 === currentLine2 &&
            alt.line3 === currentLine3;

          return (
            <button
              key={index}
              className={`sidebar-selectable-card sidebar-selectable-card--with-text ${isActive ? 'sidebar-selectable-card--active' : ''}`}
              onClick={() => onSelectAlternative(alt)}
              type="button"
            >
              <span className="sidebar-selectable-card__text">
                {altLabel || `Alternative ${index + 1}`}
              </span>
              {isActive && (
                <span className="sidebar-selectable-card__check">
                  <FaCheck size={10} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="sidebar-hint">
        Hier findest du KI-generierte Textvarianten basierend auf deiner Eingabe. Klicke auf eine Alternative, um sie direkt in dein Design zu übernehmen. Du kannst die Texte anschließend noch manuell anpassen.
      </p>
    </div>
  );
}
