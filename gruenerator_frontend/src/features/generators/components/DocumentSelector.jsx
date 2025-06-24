import React, { useState, useEffect } from 'react';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiDocumentText, HiCheckCircle, HiClock, HiExclamationCircle, HiPlus, HiX } from 'react-icons/hi';
import Spinner from '../../../components/common/Spinner';

const DocumentSelector = ({ selectedDocuments = [], onDocumentsChange }) => {
  const { user } = useOptimizedAuth();
  const {
    documents,
    isLoading,
    error,
    fetchDocuments,
    clearError
  } = useDocumentsStore();

  // Local state for UI
  const [showDocumentList, setShowDocumentList] = useState(false);

  // Fetch documents on mount
  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user, fetchDocuments]);

  // Filter only completed documents
  const availableDocuments = documents.filter(doc => doc.status === 'completed');
  const selectedDocumentIds = selectedDocuments.map(doc => doc.id);

  // Handle document selection/deselection
  const handleDocumentToggle = (document) => {
    const isSelected = selectedDocumentIds.includes(document.id);
    
    if (isSelected) {
      // Remove document
      const newSelected = selectedDocuments.filter(doc => doc.id !== document.id);
      onDocumentsChange(newSelected);
    } else {
      // Add document
      const newSelected = [...selectedDocuments, document];
      onDocumentsChange(newSelected);
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <HiCheckCircle className="text-green-500" />;
      case 'processing':
      case 'pending':
        return <HiClock className="text-yellow-500" />;
      case 'failed':
        return <HiExclamationCircle className="text-red-500" />;
      default:
        return <HiDocumentText className="text-gray-400" />;
    }
  };

  if (isLoading) {
    return (
      <div className="document-selector-loading">
        <Spinner size="small" />
        <span>Dokumente laden...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-error-message">
        <HiExclamationCircle />
        {error}
        <button 
          onClick={clearError}
          className="icon-button style-as-link"
          style={{ marginLeft: 'auto' }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="document-selector">
      {/* Selected Documents Display */}
      {selectedDocuments.length > 0 && (
        <div className="selected-documents">
          <h4>Ausgewählte Dokumente ({selectedDocuments.length})</h4>
          <div className="selected-documents-list">
            {selectedDocuments.map((document) => (
              <div key={document.id} className="selected-document-item">
                <div className="document-info">
                  <div className="document-title">
                    {getStatusIcon(document.status)}
                    <span>{document.title}</span>
                  </div>
                  <div className="document-meta">
                    <span className="document-pages">{document.page_count} Seiten</span>
                    <span className="document-filename">{document.filename}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDocumentToggle(document)}
                  className="remove-document-button"
                  title="Dokument entfernen"
                >
                  <HiX />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Documents Section */}
      <div className="add-documents-section">
        <button
          type="button"
          onClick={() => setShowDocumentList(!showDocumentList)}
          className="btn-secondary"
          disabled={availableDocuments.length === 0}
        >
          <HiPlus />
          {selectedDocuments.length === 0 ? 'Dokumente hinzufügen' : 'Weitere Dokumente hinzufügen'}
        </button>

        {availableDocuments.length === 0 && (
          <div className="no-documents-message">
            <p>Sie haben noch keine verarbeiteten Dokumente hochgeladen.</p>
            <p className="help-text">
              Gehen Sie zum Profil → Dokumente, um PDF-Dateien hochzuladen und zu verarbeiten.
            </p>
          </div>
        )}
      </div>

      {/* Document Selection List */}
      {showDocumentList && availableDocuments.length > 0 && (
        <div className="document-selection-list">
          <div className="document-list-header">
            <h4>Verfügbare Dokumente</h4>
            <button
              type="button"
              onClick={() => setShowDocumentList(false)}
              className="icon-button"
            >
              <HiX />
            </button>
          </div>
          
          <div className="documents-grid">
            {availableDocuments.map((document) => {
              const isSelected = selectedDocumentIds.includes(document.id);
              return (
                <div 
                  key={document.id} 
                  className={`document-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleDocumentToggle(document)}
                >
                  <div className="document-option-header">
                    <div className="document-title">
                      {getStatusIcon(document.status)}
                      <span>{document.title}</span>
                    </div>
                    {isSelected && (
                      <div className="selected-indicator">
                        <HiCheckCircle />
                      </div>
                    )}
                  </div>
                  
                  <div className="document-details">
                    <span className="document-pages">{document.page_count} Seiten</span>
                    <span className="document-date">
                      {new Date(document.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  
                  <div className="document-filename">
                    {document.filename}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="document-selector-help">
        <p className="help-text">
          <strong>Tipp:</strong> Ausgewählte Dokumente werden als Wissensquelle für diesen Generator verwendet. 
          Claude kann während der Texterstellung auf Inhalte aus diesen Dokumenten zugreifen und sie zitieren.
        </p>
      </div>
    </div>
  );
};

export default DocumentSelector;