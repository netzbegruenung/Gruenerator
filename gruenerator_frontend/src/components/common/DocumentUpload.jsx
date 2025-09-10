import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle, lazy } from 'react';
import { HiOutlineDocumentAdd, HiOutlineTrash, HiRefresh, HiDocumentText, HiClock, HiCheckCircle, HiExclamationCircle, HiEye, HiX } from 'react-icons/hi';
const ReactMarkdown = lazy(() => import('react-markdown'));
import { useDocumentsStore } from '../../stores/documentsStore';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { validateUrl, normalizeUrl, generateTitleFromUrl } from '../../utils/urlValidation';
import Spinner from './Spinner';
import FeatureToggle from './FeatureToggle';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.oasis.opendocument.text', // ODT
  'application/vnd.ms-excel', // XLS
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // XLSX
];

// Document Preview Component
const DocumentPreview = ({ document }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDocumentContent = async () => {
    if (previewText) {
      setShowPreview(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${AUTH_BASE_URL}/documents/${document.id}/content`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPreviewText(data.data.ocr_text || 'Kein Text extrahiert');
      setShowPreview(true);
    } catch (err) {
      console.error('Error fetching document content:', err);
      setError('Fehler beim Laden des Texts');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={fetchDocumentContent}
        className="icon-button style-as-link"
        title="Text-Vorschau anzeigen"
        disabled={loading}
      >
        {loading ? <Spinner size="xsmall" /> : <HiEye />}
      </button>

      {showPreview && (
        <div className="document-preview-overlay" onClick={() => setShowPreview(false)}>
          <div className="document-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="document-preview-header">
              <h4>Text-Vorschau: {document.title}</h4>
              <button
                onClick={() => setShowPreview(false)}
                className="icon-button"
                title="Schließen"
              >
                <HiX />
              </button>
            </div>
            
            <div className="document-preview-content">
              {error ? (
                <div className="preview-error">
                  <HiExclamationCircle />
                  {error}
                </div>
              ) : (
                <div className="preview-text">
                  <ReactMarkdown>{previewText}</ReactMarkdown>
                </div>
              )}
            </div>
            
            <div className="document-preview-footer">
              <span className="preview-stats">
                {document.page_count} Seiten • {previewText.length} Zeichen
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const DocumentUpload = forwardRef(({ 
  groupId = null, 
  onUploadComplete = null,
  onDeleteComplete = null,
  showTitle = true,
  showDocumentsList = true, // New prop to control document list visibility
  forceShowUploadForm = false, // New prop to force upload form to be visible
  showAsModal = false, // New prop to show upload form as modal
  className = ''
}, ref) => {
  console.log('[DocumentUpload] Component mounted/re-rendered with props:', {
    groupId,
    showTitle,
    showDocumentsList,
    forceShowUploadForm,
    showAsModal,
    className,
    hasOnUploadComplete: !!onUploadComplete,
    hasOnDeleteComplete: !!onDeleteComplete
  });

  const [dragActive, setDragActive] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [ocrMethod, setOcrMethod] = useState('tesseract');
  
  // URL crawling mode state
  const [uploadMode, setUploadMode] = useState('file'); // 'file' or 'url'
  const [urlInput, setUrlInput] = useState('');
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  
  // Use controlled state when forceShowUploadForm is true
  const isFormVisible = forceShowUploadForm || showUploadForm;
  const fileInputRef = useRef(null);
  
  const { user } = useOptimizedAuth();
  
  const {
    documents,
    isLoading,
    isUploading,
    error,
    fetchDocuments,
    uploadDocument,
    crawlUrl,
    deleteDocument,
    clearError,
    refreshDocument
  } = useDocumentsStore();

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    showUploadForm: () => setShowUploadForm(true),
    hideUploadForm: () => setShowUploadForm(false)
  }));

  // Fetch documents on mount
  React.useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user, fetchDocuments]);

  // Handle forceShowUploadForm prop - now using computed isFormVisible instead of useEffect

  // Debug log for showUploadForm state changes
  React.useEffect(() => {
    console.log('[DocumentUpload] showUploadForm state changed to:', showUploadForm, 'isFormVisible:', isFormVisible);
  }, [showUploadForm, isFormVisible]);

  // Validate file
  const validateFile = useCallback((file) => {
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      return 'Nur PDF-, DOCX-, ODT- und Excel-Dateien sind erlaubt.';
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return 'Datei ist zu groß. Maximum: 50MB.';
    }
    
    return null;
  }, []);

  // Handle URL input changes
  const handleUrlChange = useCallback((url) => {
    setUrlInput(url);
    
    // Auto-generate title if URL is valid and title is empty
    if (url && url.trim() && !uploadTitle) {
      const normalized = normalizeUrl(url);
      const validation = validateUrl(normalized);
      if (validation.isValid) {
        const suggestedTitle = generateTitleFromUrl(normalized);
        setUploadTitle(suggestedTitle);
      }
    }
    
    clearError();
  }, [uploadTitle, clearError]);

  // Handle file selection
  const handleFileSelect = useCallback((files) => {
    const file = files[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      alert(error);
      return;
    }

    setSelectedFile(file);
    // Remove file extension from name for title
    const nameWithoutExtension = file.name.replace(/\.(pdf|docx|odt|xls|xlsx)$/i, '');
    setUploadTitle(nameWithoutExtension);
    setShowUploadForm(true);
    clearError();
  }, [validateFile, clearError]);

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFileSelect(files);
  }, [handleFileSelect]);

  // Handle file input change
  const handleInputChange = useCallback((e) => {
    const files = Array.from(e.target.files);
    handleFileSelect(files);
  }, [handleFileSelect]);

  // Handle upload (file or URL)
  const handleUpload = async () => {
    if (uploadMode === 'file') {
      if (!selectedFile || !uploadTitle.trim()) {
        alert('Bitte wählen Sie eine Datei und geben Sie einen Titel ein.');
        return;
      }

      try {
        console.log('[DocumentUpload] Starting file upload process...');
        const result = await uploadDocument(selectedFile, uploadTitle.trim(), groupId, ocrMethod);
        console.log('[DocumentUpload] File upload successful, hiding form and calling onUploadComplete');
        resetForm();
        
        if (onUploadComplete) {
          onUploadComplete(result);
        }
      } catch (error) {
        console.error('[DocumentUpload] File upload failed:', error);
        // Error is already set in store
      }
    } else if (uploadMode === 'url') {
      if (!urlInput.trim() || !uploadTitle.trim()) {
        alert('Bitte geben Sie eine URL und einen Titel ein.');
        return;
      }

      const normalizedUrl = normalizeUrl(urlInput.trim());
      const validation = validateUrl(normalizedUrl);
      
      if (!validation.isValid) {
        alert(validation.error);
        return;
      }

      try {
        console.log('[DocumentUpload] Starting URL crawl process...');
        const result = await crawlUrl(normalizedUrl, uploadTitle.trim(), groupId);
        console.log('[DocumentUpload] URL crawl successful, hiding form and calling onUploadComplete');
        resetForm();
        
        if (onUploadComplete) {
          onUploadComplete(result);
        }
      } catch (error) {
        console.error('[DocumentUpload] URL crawl failed:', error);
        // Error is already set in store
      }
    }
  };

  // Reset form state
  const resetForm = () => {
    setShowUploadForm(false);
    setSelectedFile(null);
    setUploadTitle('');
    setUrlInput('');
    setOcrMethod('tesseract');
    setUploadMode('file');
  };

  // Handle delete
  const handleDelete = async (documentId, documentTitle) => {
    if (!window.confirm(`Möchten Sie das Dokument "${documentTitle}" wirklich löschen?`)) {
      return;
    }

    try {
      await deleteDocument(documentId);
      
      if (onDeleteComplete) {
        onDeleteComplete(documentId);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      // Error is already set in store
    }
  };

  // Handle refresh
  const handleRefresh = async (documentId) => {
    try {
      await refreshDocument(documentId);
    } catch (error) {
      console.error('Refresh failed:', error);
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

  // Get status text
  const getStatusText = (status) => {
    switch (status) {
      case 'completed':
        return 'Verarbeitet';
      case 'processing':
        return 'Wird verarbeitet...';
      case 'pending':
        return 'Warteschlange';
      case 'failed':
        return 'Fehler';
      default:
        return 'Unbekannt';
    }
  };

  return (
    <div className={`document-upload ${className}`}>
      {showTitle && (
        <div className="profile-card-header">
          <h3>Dokumente</h3>
          <button
            type="button"
            className="btn-primary size-s"
            onClick={() => setShowUploadForm(true)}
            disabled={isUploading}
          >
            <HiOutlineDocumentAdd className="icon" /> Inhalt hinzufügen
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)' }}>
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
      )}

      {/* Upload Form */}
      {isFormVisible && (
        <>
          {console.log('[DocumentUpload] Rendering upload form because isFormVisible is true. forceShowUploadForm:', forceShowUploadForm, 'showUploadForm:', showUploadForm)}
          {showAsModal ? (
            /* Modal Upload Form */
            <div className="document-preview-overlay" onClick={(e) => {
              if (e.target === e.currentTarget) {
                if (forceShowUploadForm) {
                  // When controlled by parent, notify parent to close
                  onUploadComplete && onUploadComplete(null);
                } else {
                  setShowUploadForm(false);
                  setSelectedFile(null);
                  setUploadTitle('');
                }
              }
            }}>
              <div className="document-preview-modal" onClick={e => e.stopPropagation()}>
                <div className="document-preview-header">
                  <h3>Dokument hochladen</h3>
                  <button 
                    className="document-preview-close"
                    onClick={() => {
                      if (forceShowUploadForm) {
                        // When controlled by parent, notify parent to close
                        onUploadComplete && onUploadComplete(null);
                      } else {
                        setShowUploadForm(false);
                        setSelectedFile(null);
                        setUploadTitle('');
                        setOcrMethod('tesseract');
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="document-preview-content">
                  {uploadMode === 'file' ? (
                    <>
                      <div className="form-field-wrapper">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.docx,.odt,.xls,.xlsx"
                          onChange={handleInputChange}
                          style={{ display: 'none' }}
                        />
                        
                        {selectedFile ? (
                          <div className="file-selected-simple">
                            <span className="file-name">{selectedFile.name}</span>
                          </div>
                        ) : (
                          <div
                            className={`file-dropzone ${dragActive ? 'active' : ''}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <div className="file-placeholder">
                              <HiOutlineDocumentAdd className="upload-icon" />
                              <p>PDF-, DOCX-, ODT- oder Excel-Datei hier ablegen oder klicken zum Auswählen</p>
                              <p className="file-requirements">Max. 1.000 Seiten, 50MB</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="form-field-wrapper">
                        {/* URL Input */}
                        <label className="form-label">
                          Website URL *
                        </label>
                        <input
                          type="url"
                          className="form-input"
                          value={urlInput}
                          onChange={(e) => handleUrlChange(e.target.value)}
                          placeholder="https://example.com/article"
                          disabled={isUploading}
                        />
                        <p className="field-help">
                          Geben Sie die URL einer Website ein, die gecrawlt werden soll. 
                          Der Inhalt wird automatisch extrahiert und als Dokument hinzugefügt.
                        </p>
                      </div>
                      
                      {/* Back to file upload option */}
                      <div className="form-field-wrapper" style={{ textAlign: 'center', marginTop: 'var(--spacing-small)' }}>
                        <button
                          type="button"
                          onClick={() => setUploadMode('file')}
                          className="upload-mode-link"
                          disabled={isUploading}
                        >
                          Zurück zur Datei-Upload
                        </button>
                      </div>
                    </>
                  )}

                  {/* Title Input */}
                  {(selectedFile || (uploadMode === 'url' && urlInput.trim())) && (
                    <div className="form-field-wrapper">
                      <label className="form-label">
                        Titel des Dokuments *
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="Geben Sie einen aussagekräftigen Titel ein..."
                        disabled={isUploading}
                      />
                    </div>
                  )}

                  {/* OCR Method Selection - only for PDF file uploads */}
                  {/* TEMPORARILY HIDDEN: Mistral OCR option
                  {uploadMode === 'file' && selectedFile && selectedFile.type === 'application/pdf' && (
                    <div className="form-field-wrapper">
                      <label className="form-label">
                        OCR-Methode
                      </label>
                      <FeatureToggle
                        isActive={ocrMethod === 'mistral'}
                        onToggle={(enabled) => setOcrMethod(enabled ? 'mistral' : 'tesseract')}
                        label="Mistral AI OCR"
                        icon={HiDocumentText}
                        description="Nicht notwendig für normale Nutzung"
                      />
                    </div>
                  )}
                  */}
                </div>
                <div className="document-preview-actions">
                  <button 
                    onClick={handleUpload}
                    className="btn-primary"
                    disabled={isUploading || 
                      (uploadMode === 'file' && (!selectedFile || !uploadTitle.trim())) ||
                      (uploadMode === 'url' && (!urlInput.trim() || !uploadTitle.trim()))
                    }
                  >
                    {isUploading ? (
                      <>
                        <Spinner size="xsmall" />
                        {uploadMode === 'file' ? 'Wird hochgeladen...' : 'Website wird verarbeitet...'}
                      </>
                    ) : (
                      uploadMode === 'file' ? 'Hochladen' : 'Website crawlen'
                    )}
                  </button>
                  {uploadMode === 'file' && selectedFile && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary"
                      disabled={isUploading}
                    >
                      Datei ändern
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (forceShowUploadForm) {
                        // When controlled by parent, notify parent to close
                        onUploadComplete && onUploadComplete(null);
                      } else {
                        resetForm();
                      }
                    }}
                    className="btn-secondary"
                    disabled={isUploading}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Inline Upload Form */
            <div className="knowledge-entry knowledge-entry-bordered" style={{ marginBottom: 'var(--spacing-medium)' }}>
              {uploadMode === 'file' ? (
                <>
                  <div className="form-field-wrapper">
                    <label className="form-label">
                      Datei hochladen
                    </label>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.odt,.xls,.xlsx"
                      onChange={handleInputChange}
                      style={{ display: 'none' }}
                    />
                    
                    {selectedFile ? (
                      <div className="file-selected-simple">
                        <span className="file-name">{selectedFile.name}</span>
                      </div>
                    ) : (
                      <div
                        className={`file-dropzone ${dragActive ? 'active' : ''}`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="file-placeholder">
                          <HiOutlineDocumentAdd className="upload-icon" />
                          <p>PDF-, DOCX-, ODT- oder Excel-Datei hier ablegen oder klicken zum Auswählen</p>
                          <p className="file-requirements">Max. 50 Seiten, 50MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="form-field-wrapper">
                    {/* URL Input */}
                    <label className="form-label">
                      Website URL *
                    </label>
                    <input
                      type="url"
                      className="form-input"
                      value={urlInput}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="https://example.com/article"
                      disabled={isUploading}
                    />
                    <p className="field-help">
                      Geben Sie die URL einer Website ein, die gecrawlt werden soll. 
                      Der Inhalt wird automatisch extrahiert und als Dokument hinzugefügt.
                    </p>
                  </div>
                  
                  {/* Back to file upload option */}
                  <div className="form-field-wrapper" style={{ textAlign: 'center', marginTop: 'var(--spacing-small)' }}>
                    <button
                      type="button"
                      onClick={() => setUploadMode('file')}
                      className="style-as-link"
                      style={{ fontSize: '0.9em', color: 'var(--font-color-muted)' }}
                      disabled={isUploading}
                    >
                      Zurück zur Datei-Upload
                    </button>
                  </div>
                </>
              )}

              {/* Title Input */}
              {(selectedFile || (uploadMode === 'url' && urlInput.trim())) && (
                <div className="form-field-wrapper">
                  <label className="form-label">
                    Titel des Dokuments *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Geben Sie einen aussagekräftigen Titel ein..."
                    disabled={isUploading}
                  />
                </div>
              )}

              {/* OCR Method Selection - only for PDF file uploads */}
              {/* TEMPORARILY HIDDEN: Mistral OCR option
              {uploadMode === 'file' && selectedFile && selectedFile.type === 'application/pdf' && (
                <div className="form-field-wrapper">
                  <label className="form-label">
                    OCR-Methode
                  </label>
                  <FeatureToggle
                    isActive={ocrMethod === 'mistral'}
                    onToggle={(enabled) => setOcrMethod(enabled ? 'mistral' : 'tesseract')}
                    label="Mistral AI OCR"
                    icon={HiDocumentText}
                    description="Nicht notwendig für normale Nutzung"
                  />
                </div>
              )}
              */}

              {/* Action Buttons */}
              <div className="profile-actions" style={{justifyContent: 'flex-start', gap: '10px'}}>
                <button 
                  onClick={handleUpload}
                  className="btn-primary"
                  disabled={isUploading || 
                    (uploadMode === 'file' && (!selectedFile || !uploadTitle.trim())) ||
                    (uploadMode === 'url' && (!urlInput.trim() || !uploadTitle.trim()))
                  }
                >
                  {isUploading ? (
                    <>
                      <Spinner size="xsmall" />
                      {uploadMode === 'file' ? 'Wird hochgeladen...' : 'Website wird verarbeitet...'}
                    </>
                  ) : (
                    uploadMode === 'file' ? 'Hochladen' : 'Website crawlen'
                  )}
                </button>
                {uploadMode === 'file' && selectedFile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary"
                    disabled={isUploading}
                  >
                    Datei ändern
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (forceShowUploadForm) {
                      // When controlled by parent, notify parent to close
                      onUploadComplete && onUploadComplete(null);
                    } else {
                      resetForm();
                    }
                  }}
                  className="btn-secondary"
                  disabled={isUploading}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Documents List - only show if showDocumentsList is true */}
      {showDocumentsList && (
        <div className="profile-card-content">
          {documents.length === 0 && !isLoading ? (
            <div className="knowledge-empty-state centered">
              <HiDocumentText size={48} className="empty-state-icon" />
              <p>Keine Dokumente vorhanden</p>
              <p className="empty-state-description">
                Laden Sie PDF-, DOCX-, ODT- oder Excel-Dokumente hoch, um sie als Wissensquelle zu nutzen.
              </p>
            </div>
          ) : (
            <div className="documents-list">
              {documents.map((document) => (
                <div key={document.id} className="knowledge-entry knowledge-entry-bordered">
                  <div className="document-header">
                    <div className="document-info">
                      <div className="document-title">
                        {getStatusIcon(document.status)}
                        <span>{document.title}</span>
                      </div>
                      <div className="document-meta">
                        <span className="document-status">{getStatusText(document.status)}</span>
                        {document.page_count > 0 && (
                          <span className="document-pages">{document.page_count} Seiten</span>
                        )}
                        <span className="document-date">
                          {new Date(document.created_at).toLocaleDateString('de-DE')}
                        </span>
                      </div>
                    </div>
                    <div className="document-actions">
                      {document.status === 'completed' && document.ocr_text && (
                        <DocumentPreview document={document} />
                      )}
                      {(document.status === 'processing' || document.status === 'pending') && (
                        <button
                          onClick={() => handleRefresh(document.id)}
                          className="icon-button style-as-link"
                          title="Status aktualisieren"
                        >
                          <HiRefresh />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(document.id, document.title)}
                        className="icon-button danger"
                        title="Dokument löschen"
                      >
                        <HiOutlineTrash />
                      </button>
                    </div>
                  </div>
                  
                  {document.status === 'failed' && (
                    <div className="document-error">
                      <HiExclamationCircle />
                      <span>Die Verarbeitung ist fehlgeschlagen. Versuchen Sie es erneut.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}


    </div>
  );
});

export default DocumentUpload;
