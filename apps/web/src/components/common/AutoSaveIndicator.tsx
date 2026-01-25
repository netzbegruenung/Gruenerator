import React from 'react';
import { HiCheckCircle, HiExclamationCircle } from 'react-icons/hi';
import { ImSpinner2 } from 'react-icons/im';

import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { formatAutoSaveTime } from '../../utils/dateFormatter';
import '../../assets/styles/components/common/auto-save-indicator.css';

export interface AutoSaveIndicatorProps {
  componentName: string;
  className?: string;
  onRetry?: () => void;
}

/**
 * Visual indicator for auto-save status
 * Shows current save state: idle, saving, saved, or error
 */
const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  componentName,
  className = '',
  onRetry,
}) => {
  const status = useGeneratedTextStore((state) => state.getAutoSaveStatus(componentName));
  const lastSaved = useGeneratedTextStore((state) => state.getLastAutoSaveTime(componentName));

  // Don't render anything in idle state
  if (status === 'idle') {
    return null;
  }

  const renderContent = () => {
    switch (status) {
      case 'saving':
        return (
          <>
            <ImSpinner2 className="auto-save-indicator__spinner" aria-hidden="true" />
            <span className="auto-save-indicator__text">Wird gespeichert...</span>
          </>
        );

      case 'saved':
        return (
          <>
            <HiCheckCircle
              className="auto-save-indicator__icon auto-save-indicator__icon--success"
              aria-hidden="true"
            />
            <span className="auto-save-indicator__text">
              Gespeichert {lastSaved ? formatAutoSaveTime(lastSaved) : ''}
            </span>
          </>
        );

      case 'error':
        return (
          <>
            <HiExclamationCircle
              className="auto-save-indicator__icon auto-save-indicator__icon--error"
              aria-hidden="true"
            />
            <span className="auto-save-indicator__text">Fehler beim Speichern</span>
            {onRetry && (
              <button
                className="auto-save-indicator__retry"
                onClick={onRetry}
                aria-label="Erneut versuchen"
              >
                Erneut versuchen
              </button>
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`auto-save-indicator auto-save-indicator--${status} ${className}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {renderContent()}
    </div>
  );
};

export default React.memo(AutoSaveIndicator);
