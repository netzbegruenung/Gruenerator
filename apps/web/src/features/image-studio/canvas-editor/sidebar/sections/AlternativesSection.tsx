import { AlternativesRenderer } from './AlternativesCore';
import { FaExchangeAlt, FaCheck } from 'react-icons/fa';
import Spinner from '../../../../../components/common/Spinner';
import type { DreizeilenAlternative } from '../../configs/dreizeilen.types';

type Alternative = string | DreizeilenAlternative;

export interface AlternativesSectionProps {
  alternatives: Alternative[];

  currentQuote?: string;
  onAlternativeSelect?: (alternative: string) => void;

  currentLine1?: string;
  currentLine2?: string;
  currentLine3?: string;
  onSelectAlternative?: (alt: DreizeilenAlternative) => void;
}

export function AlternativesSection(props: AlternativesSectionProps) {
  const { alternatives } = props;

  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="sidebar-section sidebar-section--alternatives">
        <div className="sidebar-section__header">
          <h3>Alternativen</h3>
        </div>
        <div className="sidebar-section__loading">
          <Spinner size="small" />
          <p className="sidebar-section__hint">
            Weitere Varianten werden generiert...
          </p>
        </div>
      </div>
    );
  }

  const isStructured =
    alternatives.length > 0 &&
    typeof alternatives[0] === 'object' &&
    ('line1' in alternatives[0] || 'line2' in alternatives[0] || 'line3' in alternatives[0]);

  if (isStructured) {
    const { currentLine1, currentLine2, currentLine3, onSelectAlternative } = props;

    return (
      <AlternativesRenderer
        alternatives={alternatives as DreizeilenAlternative[]}
        isActive={(alt) =>
          alt.line1 === currentLine1 && alt.line2 === currentLine2 && alt.line3 === currentLine3
        }
        getDisplayText={(alt, index) =>
          [alt.line1, alt.line2, alt.line3].filter(Boolean).join(' / ') ||
          `Alternative ${index + 1}`
        }
        onSelect={(alt) => onSelectAlternative?.(alt)}
        layout="cards"
        collapsible={false}
        defaultOpen={true}
        hintText="Hier findest du KI-generierte Textvarianten basierend auf deiner Eingabe. Klicke auf eine Alternative, um sie direkt in dein Design zu übernehmen. Du kannst die Texte anschließend noch manuell anpassen."
        renderPreview={(alt) => {
          const isActive =
            alt.line1 === currentLine1 && alt.line2 === currentLine2 && alt.line3 === currentLine3;
          return isActive ? (
            <span className="sidebar-selectable-card__check">
              <FaCheck size={10} />
            </span>
          ) : null;
        }}
      />
    );
  } else {
    const { currentQuote, onAlternativeSelect } = props;

    return (
      <AlternativesRenderer
        alternatives={alternatives as string[]}
        isActive={(alt) => alt === currentQuote}
        getDisplayText={(alt) => (alt.length > 50 ? alt.slice(0, 50) + '...' : alt)}
        onSelect={(alt) => onAlternativeSelect?.(alt)}
        layout="pills"
        collapsible={true}
        defaultOpen={true}
        icon={FaExchangeAlt}
        hintText="Die KI hat alternative Textvorschläge für dich erstellt. Probiere verschiedene Varianten aus, um die beste Formulierung zu finden. Nach der Auswahl kannst du den Text noch individuell anpassen."
      />
    );
  }
}
