import React, { useCallback } from 'react';
import { HiExclamationCircle } from 'react-icons/hi';

import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { buildLoginUrl } from '../../utils/authRedirect';

import { cn } from '@/utils/cn';

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

  const retryBtnClass =
    'ml-2 px-2 py-1 text-xs text-red-600 bg-transparent border border-red-600 rounded-[4px] cursor-pointer transition-all duration-200 hover:bg-red-600 hover:text-white focus:outline-2 focus:outline-red-600 focus:outline-offset-2';

  const renderContent = () => {
    switch (status) {
      case 'error':
        return (
          <>
            <HiExclamationCircle
              className="w-[18px] h-[18px] shrink-0 text-red-600 max-[768px]:w-4 max-[768px]:h-4"
              aria-hidden="true"
            />
            <span className="max-[768px]:text-[0.8125rem]">Fehler beim Speichern</span>
            {onRetry && (
              <button className={retryBtnClass} onClick={onRetry} aria-label="Erneut versuchen">
                Erneut versuchen
              </button>
            )}
          </>
        );

      case 'session_expired':
        return (
          <>
            <HiExclamationCircle
              className="w-[18px] h-[18px] shrink-0 text-red-600 max-[768px]:w-4 max-[768px]:h-4"
              aria-hidden="true"
            />
            <span className="max-[768px]:text-[0.8125rem]">Sitzung abgelaufen</span>
            <button className={retryBtnClass} onClick={handleLogin} aria-label="Anmelden">
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
      className={cn(
        'hidden text-red-600 bg-red-50 dark:bg-red-950 border border-red-600/20 max-[768px]:text-[0.8125rem] max-[768px]:px-2.5 max-[768px]:py-1.5',
        className
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {renderContent()}
    </div>
  );
};

export default React.memo(AutoSaveIndicator);
