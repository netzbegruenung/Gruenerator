import React, { useCallback } from 'react';
import { HiExclamationCircle } from 'react-icons/hi';

import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { buildLoginUrl } from '../../utils/authRedirect';
import '../../assets/styles/components/common/auto-save-indicator.css';

export interface AutoSaveIndicatorProps {
  componentName: string;
  className?: string;
  onRetry?: () => void;
}

/**
 * Visual indicator for auto-save status
 * Only shows errors — success states are silent
 */
const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  componentName,
  className = '',
  onRetry,
}) => {
  const status = useGeneratedTextStore((state) => state.getAutoSaveStatus(componentName));

  const handleLogin = useCallback(() => {
    const currentPath = window.location.pathname + window.location.search;
    window.location.href = buildLoginUrl(currentPath);
  }, []);

  if (status !== 'error' && status !== 'session_expired') {
    return null;
  }

  const renderContent = () => {
    switch (status) {
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

      case 'session_expired':
        return (
          <>
            <HiExclamationCircle
              className="auto-save-indicator__icon auto-save-indicator__icon--error"
              aria-hidden="true"
            />
            <span className="auto-save-indicator__text">Sitzung abgelaufen</span>
            <button
              className="auto-save-indicator__retry"
              onClick={handleLogin}
              aria-label="Anmelden"
            >
              Anmelden
            </button>
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
