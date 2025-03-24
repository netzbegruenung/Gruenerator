import React from 'react';
import PropTypes from 'prop-types';
const FileCard = ({ file }) => {
  // Funktion zum Bestimmen der Farbe basierend auf dem Dateityp
  const getFileTypeColor = (fileType) => {
    switch(fileType.toLowerCase()) {
      case 'pdf':
        return 'file-type-pdf'; // Rot
      case 'xlsx':
      case 'xls':
      case 'csv':
        return 'file-type-excel'; // Grün
      case 'docx':
      case 'doc':
      case 'txt':
        return 'file-type-word'; // Blau
      default:
        return 'file-type-default';
    }
  };

  // Funktion zum Bestimmen des Icons basierend auf dem Dateityp
  const getFileIcon = (fileType) => {
    switch(fileType.toLowerCase()) {
      case 'pdf':
        return '📄';
      case 'xlsx':
      case 'xls':
      case 'csv':
        return '📊';
      case 'docx':
      case 'doc':
      case 'txt':
        return '📝';
      default:
        return '📁';
    }
  };

  return (
    <a href={file.url} className={`file-card ${getFileTypeColor(file.fileType)}`} target="_blank" rel="noopener noreferrer">
      <div className="file-icon">{getFileIcon(file.fileType)}</div>
      <div className="file-info">
        <h3>{file.title}</h3>
        <p>{file.description}</p>
      </div>
    </a>
  );
};

FileCard.propTypes = {
  file: PropTypes.shape({
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    fileType: PropTypes.string.isRequired,
    url: PropTypes.string.isRequired
  }).isRequired
};

export default FileCard 