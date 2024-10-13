import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { IoCopyOutline } from "react-icons/io5";
import { copyPlainText } from '../utils/commonFunctions';

const CopyButton = ({ content }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    copyPlainText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Zurücksetzen nach 2 Sekunden
  };

  return (
    <button
      onClick={handleCopy}
      className="copy-button"
      aria-label="In die Zwischenablage kopieren"
    >
      <IoCopyOutline style={{ marginRight: '10px' }} />
      {isCopied ? 'Kopiert!' : 'In die Zwischenablage kopieren'}
    </button>
  );
};

CopyButton.propTypes = {
  content: PropTypes.string.isRequired,
};

export default CopyButton;