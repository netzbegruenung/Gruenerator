import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline, IoCheckmarkOutline } from "react-icons/io5";
import { copyPlainText } from '../utils/commonFunctions';

const CopyButton = ({ content, compact = false }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    copyPlainText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Zurücksetzen nach 2 Sekunden
  };

  return (
    <button
      onClick={handleCopy}
      className={`copy-button ${compact ? 'copy-button-compact' : ''} ${isCopied ? 'copied' : ''}`}
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
  content: PropTypes.string.isRequired,
  compact: PropTypes.bool
};

export default CopyButton;