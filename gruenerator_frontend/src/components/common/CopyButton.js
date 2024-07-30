import React from 'react';
import PropTypes from 'prop-types';
import { FaClipboard } from 'react-icons/fa';
import { handleCopyToClipboard } from '../utils/commonFunctions';

const CopyButton = ({ content }) => (
  <button onClick={() => handleCopyToClipboard(content)} className="copy-button" aria-label="In die Zwischenablage kopieren">
    <FaClipboard style={{ marginRight: '10px' }} /> In die Zwischenablage kopieren
  </button>
);

CopyButton.propTypes = {
  content: PropTypes.string.isRequired,
};

export default CopyButton;