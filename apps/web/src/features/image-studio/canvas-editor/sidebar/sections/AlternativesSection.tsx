import { FaExchangeAlt, FaCheck } from 'react-icons/fa';

import Spinner from '../../../../../components/common/Spinner';

import { AlternativesRenderer } from './AlternativesCore';

import type { DreizeilenAlternative } from '../../configs/dreizeilen.types';
import type { TwoTextAlternative } from '../../configs/alternativesSection';

type Alternative = string | DreizeilenAlternative | TwoTextAlternative;

export interface AlternativesSectionProps {
  alternatives: Alternative[];

  // String alternatives (quote)
  currentQuote?: string;
  onAlternativeSelect?: (alternative: string) => void;

  // Dreizeilen (line1/line2/line3) alternatives
  currentLine1?: string;
  currentLine2?: string;
  currentLine3?: string;
  onSelectAlternative?: (alt: DreizeilenAlternative) => void;

  // Two-text (headline/subtext) alternatives - Simple template
  currentHeadline?: string;
  currentSubtext?: string;
  onSelectTwoTextAlternative?: (alt: TwoTextAlternative) => void;
}

export function AlternativesSection(props: AlternativesSectionProps) {
  const { alternatives } = props;
  console.log('[DEBUG AlternativesSection] Props:', props);
  console.log('[DEBUG AlternativesSection] Alternatives:', alternatives);
  console.log('[DEBUG AlternativesSection] Alternatives type check:', alternatives?.length > 0 ? typeof alternatives[0] : 'empty');
  if (alternatives?.length > 0 && typeof alternatives[0] === 'object') {
    console.log('[DEBUG AlternativesSection] First alternative keys:', Object.keys(alternatives[0]));
  }

  if (!alternatives || alternatives.length === 0) {
    return (
      <div className="sidebar-section sidebar-section--alternatives">
        <div className="sidebar-section__header">
          <h3>Alternativen</h3>
        </div>
        <div className="sidebar-section__loading">
          <Spinner size="small" />
          <p className="sidebar-section__hint">Weitere Varianten werden generiert...</p>
        </div>
      </div>
    );
  }

  // Detect alternative type based on object shape
  const firstAlt = alternatives[0];
  const isObject = typeof firstAlt === 'object' && firstAlt !== null;

  const isDreizeilen = isObject && ('line1' in firstAlt || 'line2' in firstAlt || 'line3' in firstAlt);
  const isTwoText = isObject && ('headline' in firstAlt || 'subtext' in firstAlt);

  console.log('[DEBUG AlternativesSection] Type detection:', { isDreizeilen, isTwoText, isObject });

  // Dreizeilen alternatives (line1/line2/line3)
  if (isDreizeilen) {
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
  }

  // Two-text alternatives (headline/subtext) - Simple template
  if (isTwoText) {
    const { currentHeadline, currentSubtext, onSelectTwoTextAlternative } = props;

    return (
      <AlternativesRenderer
        alternatives={alternatives as TwoTextAlternative[]}
        isActive={(alt) => alt.headline === currentHeadline && alt.subtext === currentSubtext}
        getDisplayText={(alt, index) =>
          [alt.headline, alt.subtext].filter(Boolean).join(' – ') || `Alternative ${index + 1}`
        }
        onSelect={(alt) => onSelectTwoTextAlternative?.(alt)}
        layout="cards"
        collapsible={false}
        defaultOpen={true}
        hintText="Hier findest du KI-generierte Textvarianten basierend auf deiner Eingabe. Klicke auf eine Alternative, um sie direkt in dein Design zu übernehmen. Du kannst die Texte anschließend noch manuell anpassen."
        renderPreview={(alt) => {
          const isActive = alt.headline === currentHeadline && alt.subtext === currentSubtext;
          return isActive ? (
            <span className="sidebar-selectable-card__check">
              <FaCheck size={10} />
            </span>
          ) : null;
        }}
      />
    );
  }

  // String alternatives (quote) - fallback
  const { currentQuote, onAlternativeSelect } = props;

  return (
    <AlternativesRenderer
      alternatives={alternatives as string[]}
      isActive={(alt) => alt === currentQuote}
      getDisplayText={(alt) => (typeof alt === 'string' && alt.length > 50 ? alt.slice(0, 50) + '...' : String(alt))}
      onSelect={(alt) => onAlternativeSelect?.(alt)}
      layout="pills"
      collapsible={true}
      defaultOpen={true}
      icon={FaExchangeAlt}
      hintText="Die KI hat alternative Textvorschläge für dich erstellt. Probiere verschiedene Varianten aus, um die beste Formulierung zu finden. Nach der Auswahl kannst du den Text noch individuell anpassen."
    />
  );
}
