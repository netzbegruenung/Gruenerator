import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaCheckCircle } from 'react-icons/fa';

interface GeneratorCreationSuccessScreenProps {
  name: string;
  slug: string;
  onRestart: () => void;
  onClose?: () => void;
}

const GeneratorCreationSuccessScreen: React.FC<GeneratorCreationSuccessScreenProps> = memo(({
  name,
  slug,
  onRestart,
  onClose
}) => {
  // Memoize the link path
  const generatorPath = useMemo(() => `/gruenerator/${slug}`, [slug]);

  return (
    <div className="success-screen-container">
      <FaCheckCircle className="success-icon" />
      <h1>Erfolg!</h1>
      <p className="success-message">
        Dein Grünerator "<strong>{name}</strong>" wurde erfolgreich erstellt.
      </p>
      <div className="success-actions">
        <Link to={generatorPath} className="button button-primary button-large">
          Zum Grünerator
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className="button button-secondary button-large"
        >
          Weiteren erstellen
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="button button-tertiary button-large"
          >
            Zur Übersicht
          </button>
        )}
      </div>
    </div>
  );
});

GeneratorCreationSuccessScreen.displayName = 'GeneratorCreationSuccessScreen';

export default GeneratorCreationSuccessScreen;
