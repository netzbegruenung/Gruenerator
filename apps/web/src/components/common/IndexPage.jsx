import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/gallery-layout.css';

const IndexPage = ({
  title,
  description = null,
  headerContent = null,
  children,
  loading = false,
  error = null,
  emptyMessage = 'Keine Inhalte verfügbar.',
  className = '',
  ...props
}) => {
  return (
    <div className={`container with-header gallery-layout ${className}`} {...props}>
      <div className="gallery-header">
        {title && <h1>{title}</h1>}
        {description && <p className="gallery-description">{description}</p>}
        {headerContent && <div className="gallery-header-content">{headerContent}</div>}
      </div>

      <div className="gallery-content">
        {loading && (
          <div className="gallery-loading">
            <div className="spinner" />
            <p>Lädt...</p>
          </div>
        )}

        {error && (
          <div className="gallery-error">
            <p>Fehler: {error}</p>
          </div>
        )}

        {!loading && !error && !children && (
          <div className="gallery-empty">
            <p>{emptyMessage}</p>
          </div>
        )}

        {!loading && !error && children && (
          <div className="gallery-grid">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

IndexPage.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  headerContent: PropTypes.node,
  children: PropTypes.node,
  loading: PropTypes.bool,
  error: PropTypes.string,
  emptyMessage: PropTypes.string,
  className: PropTypes.string
};

export default IndexPage;
