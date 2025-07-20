import React from 'react';
import PropTypes from 'prop-types';
import { HiDotsVertical, HiDocumentAdd } from 'react-icons/hi';
import MenuDropdown from '../../../components/common/MenuDropdown';

const BundestagDocumentCard = ({ document, onClick, onSaveToDocuments, isSaving = false }) => {
  const getDocumentTypeLabel = (type) => {
    switch (type) {
      case 'drucksache':
        return 'Drucksache';
      case 'plenarprotokoll':
        return 'Plenarprotokoll';
      case 'vorgang':
        return 'Vorgang';
      default:
        return type;
    }
  };

  const getDocumentTypeClass = (type) => {
    switch (type) {
      case 'drucksache':
        return 'doc-type-drucksache';
      case 'plenarprotokoll':
        return 'doc-type-plenar';
      case 'vorgang':
        return 'doc-type-vorgang';
      default:
        return 'doc-type-unknown';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const handleClick = () => {
    if (onClick) {
      onClick(document);
    } else if (document.url) {
      window.open(document.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="bundestag-document-card" onClick={handleClick}>
      <div className="document-header">
        <div className="document-header-left">
          <div className={`document-type-badge ${getDocumentTypeClass(document.type)}`}>
            {getDocumentTypeLabel(document.type)}
          </div>
          {document.wahlperiode && (
            <div className="wahlperiode-badge">
              {document.wahlperiode}. WP
            </div>
          )}
        </div>
        <div className="document-header-right">
          {onSaveToDocuments && (
            <MenuDropdown
              trigger={
                <button 
                  className="document-menu-button"
                  title="Aktionen"
                >
                  <HiDotsVertical />
                </button>
              }
              alignRight={true}
            >
              {({ onClose }) => (
                <div className="document-menu">
                  <button
                    className="document-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSaveToDocuments(document);
                      onClose();
                    }}
                    disabled={isSaving}
                  >
                    <HiDocumentAdd className="menu-item-icon" />
                    {isSaving ? 'Wird gespeichert...' : 'Zu meinen Dokumenten hinzufügen'}
                  </button>
                </div>
              )}
            </MenuDropdown>
          )}
        </div>
      </div>
      
      <h3 className="document-title">{document.title}</h3>
      
      {document.nummer && (
        <div className="document-number">
          {document.type === 'drucksache' ? 'Drs. ' : 'Nr. '}{document.nummer}
        </div>
      )}
      
      {document.initiative && (
        <div className="document-initiative">
          {document.initiative.join(', ')}
        </div>
      )}
      
      {document.abstract && (
        <p className="document-abstract">
          {document.abstract.length > 200 
            ? `${document.abstract.substring(0, 200)}...` 
            : document.abstract
          }
        </p>
      )}
      
      {document.dokumentart && document.type === 'drucksache' && (
        <div className="document-art">
          {document.dokumentart}
        </div>
      )}
      
      <div className="document-footer">
        {document.date && (
          <span className="document-date">
            {formatDate(document.date)}
          </span>
        )}
        {document.fundstelle && (
          <span className="document-fundstelle">
            {document.fundstelle}
          </span>
        )}
      </div>
    </div>
  );
};

BundestagDocumentCard.propTypes = {
  document: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    date: PropTypes.string,
    nummer: PropTypes.string,
    wahlperiode: PropTypes.string,
    initiative: PropTypes.arrayOf(PropTypes.string),
    abstract: PropTypes.string,
    dokumentart: PropTypes.string,
    fundstelle: PropTypes.string,
    url: PropTypes.string
  }).isRequired,
  onClick: PropTypes.func,
  onSaveToDocuments: PropTypes.func,
  isSaving: PropTypes.bool
};

export default BundestagDocumentCard;