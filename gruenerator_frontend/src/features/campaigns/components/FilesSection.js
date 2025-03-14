import React from 'react';
import PropTypes from 'prop-types';
import './FilesSection.css';
import FileCard from './FileCard';

const FilesSection = ({ files, className }) => {
  return (
    <section className={`dashboard-section ${className || ''}`}>
      <h2>Dateien</h2>
      {files.length === 0 ? (
        <div className="no-results">Keine Dateien gefunden</div>
      ) : (
        <div className="files-grid">
          {files.map(file => (
            <FileCard key={file.id} file={file} />
          ))}
        </div>
      )}
    </section>
  );
};

FilesSection.propTypes = {
  files: PropTypes.array.isRequired,
  className: PropTypes.string
};

export default FilesSection; 