import { type JSX, useState, useEffect, useRef, MouseEvent, type ReactNode } from 'react';

import Spinner from './Spinner';
import '../../assets/styles/components/ui/button.css';

interface SubmitButtonProps {
  onClick?: (event: React.MouseEvent) => void;
  loading?: boolean;
  success?: boolean;
  text: string;
  icon?: ReactNode;
  className?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit' | 'reset';
  statusMessage?: string;
  showStatus?: boolean;
  tabIndex?: number;
  imageLimitInfo?: {
    count?: number;
    limit?: number;
  };
  iconOnly?: boolean;
  disabled?: boolean;
  isStreaming?: boolean;
  streamingMessage?: string;
  onAbort?: () => void;
}

const SubmitButton = ({
  onClick,
  loading,
  success,
  text,
  icon,
  className = '',
  ariaLabel,
  type = 'submit',
  statusMessage,
  showStatus = false,
  tabIndex,
  imageLimitInfo,
  iconOnly = false,
  disabled,
  isStreaming = false,
  streamingMessage,
  onAbort,
}: SubmitButtonProps): JSX.Element => {
  const [internalSuccess, setInternalSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (success && !internalSuccess) {
      setInternalSuccess(true);
    }

    if (internalSuccess) {
      timerRef.current = setTimeout(() => {
        setInternalSuccess(false);
      }, 3000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [success, internalSuccess]);

  const handleClick = (event: React.MouseEvent) => {
    if (isStreaming && onAbort) {
      event.preventDefault();
      onAbort();
      return;
    }

    if (!loading && onClick) {
      const activeElement = document.activeElement as HTMLElement | null;

      if (
        activeElement &&
        (activeElement.closest('.react-select') ||
          activeElement.closest('.react-select__input') ||
          (typeof activeElement.className === 'string' &&
            activeElement.className.includes('react-select')))
      ) {
        return;
      }

      onClick(event);
    }
  };

  const getDisplayText = () => {
    if (isStreaming) {
      return 'Grüneriere...';
    }

    if (loading && statusMessage && showStatus) {
      return statusMessage;
    }

    if (
      imageLimitInfo &&
      typeof imageLimitInfo.count !== 'undefined' &&
      typeof imageLimitInfo.limit !== 'undefined'
    ) {
      return `${text} (${imageLimitInfo.count}/${imageLimitInfo.limit})`;
    }

    return text;
  };

  const isStreamingActive = isStreaming && onAbort;

  return (
    <button
      type={isStreamingActive ? 'button' : type}
      onClick={handleClick}
      className={`btn-primary ${className} ${loading && !isStreaming ? 'btn-loading' : ''} ${internalSuccess ? 'btn-success' : ''} ${iconOnly && !isStreaming ? 'btn-icon-only' : ''} ${isStreamingActive ? 'btn-streaming' : ''}`}
      aria-busy={loading || isStreaming}
      aria-label={isStreamingActive ? 'Abbrechen' : ariaLabel || text}
      disabled={loading && !isStreaming}
      tabIndex={tabIndex}
    >
      {isStreamingActive ? (
        <>
          <Spinner size="small" white />
          <span>{getDisplayText()}</span>
        </>
      ) : (
        <>
          {loading && <Spinner size="small" white />}
          {icon && !loading && <span className="btn-icon">{icon}</span>}
          {!iconOnly && <span>{getDisplayText()}</span>}
        </>
      )}
    </button>
  );
};

export default SubmitButton;
