import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { copyFormattedContent } from '../utils/commonFunctions';

const CopyButton = ({ 
  compact = false, 
  variant = 'default',
  size = 'medium',
  position = 'left',
  className = '',
  content
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const isMobileView = window.innerWidth <= 768;

  const handleCopy = () => {
    copyFormattedContent(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      },
      (error) => {
        console.error('Fehler beim Kopieren:', error);
      }
    );
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        className={`action-button copy-button ${className} ${isCopied ? 'copied' : ''}`}
        aria-label={isCopied ? "Kopiert!" : "In die Zwischenablage kopieren"}
        {...(!isMobileView && {
          'data-tooltip-id': "action-tooltip",
          'data-tooltip-content': isCopied ? "Kopiert!" : "In die Zwischenablage kopieren"
        })}
      >
        {isCopied ? (
          <IoCheckmarkOutline size={16} />
        ) : (
          <IoCopyOutline size={16} />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={`copy-button ${compact ? 'copy-button-compact' : ''} ${isCopied ? 'copied' : ''} ${className}`}
      aria-label={isCopied ? "Kopiert!" : "In die Zwischenablage kopieren"}
      title={isCopied ? "Kopiert!" : "In die Zwischenablage kopieren"}
    >
      {isCopied ? (
        <>
          <IoCheckmarkOutline className="copy-icon" />
          {!compact && <span>Kopiert!</span>}
        </>
      ) : (
        <>
          <IoCopyOutline className="copy-icon" />
          {!compact && <span>In die Zwischenablage kopieren</span>}
        </>
      )}
    </button>
  );
};

CopyButton.propTypes = {
  compact: PropTypes.bool,
  variant: PropTypes.oneOf(['default', 'icon']),
  size: PropTypes.string,
  position: PropTypes.string,
  className: PropTypes.string,
  content: PropTypes.string
};

export default CopyButton;