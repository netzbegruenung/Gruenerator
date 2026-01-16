import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useDocumentsStore, type Document } from '../../../stores/documentsStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import {
  HiDocumentText,
  HiCheckCircle,
  HiClock,
  HiExclamationCircle,
  HiX,
  HiSearch,
  HiDocumentDuplicate,
  HiUpload
} from 'react-icons/hi';
import Spinner from '../../../components/common/Spinner';
import { ProfileIconButton } from '../../../components/profile/actions/ProfileActionButton';
import '../../../assets/styles/components/custom-generator/document-selector.css';

interface DocumentSelectorProps {
  selectedDocuments?: Document[];
  onDocumentsChange: (documents: Document[]) => void;
  compact?: boolean;
  onRemoveDocument?: ((id: string, title: string) => void) | null;
  disabled?: boolean;
}

const DocumentSelector: React.FC<DocumentSelectorProps> = memo(({
  selectedDocuments = [],
  onDocumentsChange,
  compact = false,
  onRemoveDocument = null,
  disabled = false
}) => {
  const { user } = useOptimizedAuth();
  const {
    documents,
    isLoading,
    error,
    fetchDocuments,
    clearError
  } = useDocumentsStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAllChips, setShowAllChips] = useState(false);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user, fetchDocuments]);

  const availableDocuments = useMemo(() =>
    documents.filter(doc => doc.status === 'completed'),
    [documents]
  );

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return availableDocuments;
    const query = searchQuery.toLowerCase();
    return availableDocuments.filter(doc =>
      doc.title?.toLowerCase().includes(query) ||
      doc.filename?.toLowerCase().includes(query)
    );
  }, [availableDocuments, searchQuery]);

  const selectedDocumentIds = useMemo(() =>
    selectedDocuments.map(doc => doc.id),
    [selectedDocuments]
  );

  const handleDocumentToggle = useCallback((document: Document) => {
    if (disabled) return;

    const isSelected = selectedDocumentIds.includes(document.id);

    if (isSelected) {
      if (compact && onRemoveDocument) {
        onRemoveDocument(document.id, document.title);
      } else {
        const newSelected = selectedDocuments.filter(doc => doc.id !== document.id);
        onDocumentsChange(newSelected);
      }
    } else {
      const newSelected = [...selectedDocuments, document];
      onDocumentsChange(newSelected);
    }
  }, [disabled, selectedDocumentIds, compact, onRemoveDocument, selectedDocuments, onDocumentsChange]);

  const handleRemoveFromChip = useCallback((e: React.MouseEvent, document: Document) => {
    e.stopPropagation();
    if (disabled) return;

    if (compact && onRemoveDocument) {
      onRemoveDocument(document.id, document.title);
    } else {
      const newSelected = selectedDocuments.filter(doc => doc.id !== document.id);
      onDocumentsChange(newSelected);
    }
  }, [disabled, compact, onRemoveDocument, selectedDocuments, onDocumentsChange]);

  const getFileExtension = useCallback((filename: string) => {
    const ext = filename?.split('.').pop()?.toUpperCase() || 'DOC';
    return ext.length > 4 ? 'DOC' : ext;
  }, []);

  const getStatusInfo = useCallback((status: string) => {
    switch (status) {
      case 'completed':
        return { icon: HiCheckCircle, color: 'success', label: 'Bereit' };
      case 'processing':
      case 'pending':
        return { icon: HiClock, color: 'warning', label: 'Verarbeitung' };
      case 'failed':
        return { icon: HiExclamationCircle, color: 'error', label: 'Fehler' };
      default:
        return { icon: HiDocumentText, color: 'muted', label: 'Unbekannt' };
    }
  }, []);

  const visibleChips = showAllChips ? selectedDocuments : selectedDocuments.slice(0, 3);
  const hiddenChipsCount = selectedDocuments.length - 3;

  if (isLoading) {
    return (
      <div className="doc-selector doc-selector--loading">
        <Spinner size="small" />
        <span>Dokumente laden...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="doc-selector doc-selector--error">
        <HiExclamationCircle className="error-icon" />
        <span>{error}</span>
        <button onClick={clearError} className="error-dismiss" aria-label="Fehler schließen">
          <HiX />
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="doc-selector doc-selector--compact">
        {selectedDocuments.length > 0 ? (
          <div className="compact-list">
            {selectedDocuments.map((document) => (
              <div key={document.id} className="compact-item">
                <HiDocumentText className="compact-icon" />
                <span className="compact-title">{document.title || document.filename}</span>
                {onRemoveDocument && !disabled && (
                  <ProfileIconButton
                    action="delete"
                    variant="delete"
                    onClick={() => onRemoveDocument(document.id, document.title)}
                    title="Dokument entfernen"
                    ariaLabel={`Dokument ${document.title} entfernen`}
                    size="s"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="compact-empty">
            Keine Dokumente zugewiesen. Dokumente können über die Bearbeitungsfunktion hinzugefügt werden.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="doc-selector doc-selector--fullwidth">
      {/* Header with Search */}
      <div className="doc-selector__header">
        <div className="doc-selector__title">
          <HiDocumentDuplicate className="title-icon" />
          <span>Dokumente auswählen</span>
          {selectedDocuments.length > 0 && (
            <span className="selection-badge">{selectedDocuments.length}</span>
          )}
        </div>

        {availableDocuments.length > 3 && (
          <div className="doc-selector__search">
            <HiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Dokumente suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              disabled={disabled}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="search-clear"
                aria-label="Suche löschen"
              >
                <HiX />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selection Chips */}
      {selectedDocuments.length > 0 && (
        <div className="doc-selector__chips">
          <span className="chips-label">Ausgewählt:</span>
          <div className="chips-container">
            {visibleChips.map((document) => (
              <div key={document.id} className="selection-chip">
                <HiDocumentText className="chip-icon" />
                <span className="chip-title">{document.title || document.filename}</span>
                {!disabled && (
                  <button
                    onClick={(e) => handleRemoveFromChip(e, document)}
                    className="chip-remove"
                    aria-label={`${document.title} entfernen`}
                  >
                    <HiX />
                  </button>
                )}
              </div>
            ))}
            {hiddenChipsCount > 0 && !showAllChips && (
              <button
                className="chips-more"
                onClick={() => setShowAllChips(true)}
              >
                +{hiddenChipsCount} weitere
              </button>
            )}
            {showAllChips && selectedDocuments.length > 3 && (
              <button
                className="chips-less"
                onClick={() => setShowAllChips(false)}
              >
                weniger
              </button>
            )}
          </div>
        </div>
      )}

      {/* Documents Grid */}
      {availableDocuments.length > 0 ? (
        <div className="doc-selector__grid">
          {filteredDocuments.length > 0 ? (
            filteredDocuments.map((document) => {
              const isSelected = selectedDocumentIds.includes(document.id);
              const statusInfo = getStatusInfo(document.status);
              const StatusIcon = statusInfo.icon;
              const fileExt = getFileExtension(document.filename || '');

              return (
                <button
                  key={document.id}
                  type="button"
                  className={`doc-card ${isSelected ? 'doc-card--selected' : ''} ${disabled ? 'doc-card--disabled' : ''}`}
                  onClick={() => handleDocumentToggle(document)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={`${document.title} ${isSelected ? 'ausgewählt' : 'auswählen'}`}
                >
                  {/* Selection Checkmark */}
                  <div className={`doc-card__check ${isSelected ? 'doc-card__check--visible' : ''}`}>
                    <HiCheckCircle />
                  </div>

                  {/* File Type Badge */}
                  <div className="doc-card__badge">{fileExt}</div>

                  {/* Document Icon */}
                  <div className="doc-card__icon">
                    <HiDocumentText />
                  </div>

                  {/* Document Info */}
                  <div className="doc-card__content">
                    <h4 className="doc-card__title">{document.title || document.filename}</h4>
                    <div className="doc-card__meta">
                      <span className="meta-pages">{document.page_count} Seiten</span>
                      <span className="meta-status">
                        <StatusIcon className={`status-icon status-icon--${statusInfo.color}`} />
                      </span>
                    </div>
                    <span className="doc-card__filename">{document.filename}</span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="doc-selector__no-results">
              <HiSearch className="no-results-icon" />
              <p>Keine Dokumente gefunden für „{searchQuery}"</p>
              <button onClick={() => setSearchQuery('')} className="btn-secondary btn-small">
                Suche zurücksetzen
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="doc-selector__empty">
          <div className="empty-illustration">
            <HiUpload className="empty-icon" />
          </div>
          <h4>Noch keine Dokumente vorhanden</h4>
          <p>
            Laden Sie PDF-Dokumente in Ihrem Profil hoch, um sie als Wissensquelle
            für Ihre Grüneratoren zu nutzen.
          </p>
          <a href="/profil?tab=content" className="btn-primary btn-small">
            Dokumente hochladen
          </a>
        </div>
      )}

      {/* Help Text */}
      {availableDocuments.length > 0 && (
        <div className="doc-selector__help">
          <span className="help-icon">💡</span>
          <p>
            Ausgewählte Dokumente werden als Wissensquelle verwendet.
            Claude kann während der Texterstellung auf diese Inhalte zugreifen und sie zitieren.
          </p>
        </div>
      )}
    </div>
  );
});

DocumentSelector.displayName = 'DocumentSelector';

export default DocumentSelector;
