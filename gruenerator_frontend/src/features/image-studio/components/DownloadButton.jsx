import React from 'react';
import PropTypes from 'prop-types';
import { FaDownload } from 'react-icons/fa';

const DownloadButton = ({ imageUrl, buttonText = "Bild herunterladen", downloadFilename = "image-studio.png" }) => (
  <a href={imageUrl} download={downloadFilename} className="sharepic-download-button" aria-label={buttonText}>
    <FaDownload style={{ marginRight: '10px' }} /> {buttonText}
  </a>
);

DownloadButton.propTypes = {
  imageUrl: PropTypes.string.isRequired,
  buttonText: PropTypes.string,
  downloadFilename: PropTypes.string
};

export default DownloadButton;
