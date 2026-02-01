import React from 'react';
import { FaTimes } from 'react-icons/fa';

import Spinner from '../../../components/common/Spinner';
import '../styles/ProcessingIndicator.css';

interface ProcessingIndicatorProps {
  onCancel?: () => void;
  error?: string | null;
}

const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ onCancel, error }) => {
  return (
    <div className="processing-indicator">
      <div className="processing-container">
        <div className="processing-content">
          {error ? (
            <>
              <div className="processing-icon-container error">
                <FaTimes className="processing-icon error-icon" />
              </div>
              <div className="processing-text">
                <h3>Fehler bei der Verarbeitung</h3>
                <p>{error}</p>
              </div>
            </>
          ) : (
            <>
              <Spinner size="large" />
              <div className="processing-text">
                <h3>Video wird verarbeitet...</h3>
                <p>Der Grünerator erstellt jetzt deine Untertitel</p>
              </div>
            </>
          )}
        </div>

        {onCancel && (
          <button className="btn-secondary cancel-btn" onClick={onCancel}>
            Verarbeitung abbrechen
          </button>
        )}
      </div>
    </div>
  );
};

export default ProcessingIndicator;
