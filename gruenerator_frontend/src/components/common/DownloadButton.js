import React from 'react';
import PropTypes from 'prop-types';
import { FaDownload } from 'react-icons/fa';

const DownloadButton = ({ imageUrl }) => (
  <a href={imageUrl} download="sharepic.png" className="sharepic-download-button" aria-label="Sharepic herunterladen">
    <FaDownload style={{ marginRight: '10px' }} /> Sharepic herunterladen
  </a>
);

DownloadButton.propTypes = {
  imageUrl: PropTypes.string.isRequired,
};

export default DownloadButton;