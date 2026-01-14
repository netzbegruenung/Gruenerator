import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle, lazy } from 'react';
import { HiOutlineDocumentAdd, HiOutlineTrash, HiRefresh, HiDocumentText, HiClock, HiCheckCircle, HiExclamationCircle, HiEye, HiX, HiOutlineLink, HiOutlineCloudDownload } from 'react-icons/hi';
const ReactMarkdown = lazy(() => import('react-markdown'));
import { useDocumentsStore } from '../../stores/documentsStore';
import { useWolkeStore } from '../../stores/wolkeStore';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { validateUrl, normalizeUrl, generateTitleFromUrl } from '../../utils/urlValidation';
import Spinner from './Spinner';
import FeatureToggle from './FeatureToggle';
import WolkeFilePicker from './WolkeFilePicker/WolkeFilePicker';
import apiClient from '../utils/apiClient';

// Import button styles for modal
import '../../assets/styles/components/ui/button.css';
import '../../assets/styles/common/markdown-styles.css';
import './DocumentUpload.css';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  'image/png',
  'image/jpeg',
  'image/avif',
  'text/plain',
  'text/markdown'
];

interface DocumentPreviewDocument {
  id: string;
  title: string;
  status: string;
  created_at?: string;
  page_count?: number;
  ocr_text?: string;
}

interface DocumentPreviewProps {
  document: DocumentPreviewDocument;
}

interface DocumentUploadProps {
  groupId?: string | null;
  onUploadComplete?: ((result: unknown) => void) | null;
  onDeleteComplete?: ((documentId: string) => void) | null;
  showTitle?: boolean;
  showDocumentsList?: boolean;
  forceShowUploadForm?: boolean;
  showAsModal?: boolean;
  className?: string;
}

export interface DocumentUploadRef {
  showUploadForm: () => void;
  hideUploadForm: () => void;
}

interface WolkeSelectedFile {
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
  lastModified?: string;
  isDirectory?: boolean;
  fileExtension: string;
  isSupported: boolean;
  sizeFormatted: string;
  lastModifiedFormatted?: string;
  shareLinkId: string;
}

// Document Preview Component
const DocumentPreview = ({ document }: DocumentPreviewProps) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocumentContent = async () => {
    if (previewText) {
      setShowPreview(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/documents/${document.id}/content`);
      const data = response.data;
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
        {loading ? <Spinner size="small" /> : <HiEye />}
      </button>

      {showPreview && (
        <div className="document-preview-overlay" onClick={() => setShowPreview(false)}>
          <div className="document-preview-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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

const DocumentUpload = forwardRef<DocumentUploadRef, DocumentUploadProps>(({
  groupId = null,
  onUploadComplete = null,
  onDeleteComplete = null,
  showTitle = true,
  showDocumentsList = true,
  forceShowUploadForm = false,
  showAsModal = false,
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrMethod, setOcrMethod] = useState('tesseract');

  // Upload mode state
  const [uploadMode, setUploadMode] = useState('file'); // 'file', 'url', or 'wolke'
  const [urlInput, setUrlInput] = useState('');
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);

  // Wolke import state
  const [selectedWolkeFiles, setSelectedWolkeFiles] = useState<WolkeSelectedFile[]>([]);
  const [wolkeImportProgress, setWolkeImportProgress] = useState(0);

  // Use controlled state when forceShowUploadForm is true
  const isFormVisible = forceShowUploadForm || showUploadForm;
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    refreshDocument,
    browseWolkeFiles,
    importWolkeFiles
  } = useDocumentsStore();

  // Wolke store for preloading
  const { progressivePreload, preloadFiles } = useWolkeStore();

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

  // Preload Wolke data progressively on mount
  React.useEffect(() => {
    if (user) {
      // Start progressive preloading in the background
      progressivePreload();
    }
  }, [user, progressivePreload]);

  // Handle forceShowUploadForm prop - now using computed isFormVisible instead of useEffect

  // Debug log for showUploadForm state changes
  React.useEffect(() => {
    console.log('[DocumentUpload] showUploadForm state changed to:', showUploadForm, 'isFormVisible:', isFormVisible);
  }, [showUploadForm, isFormVisible]);

  // Validate file
  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      return 'Nur PDF, Word (DOCX), PowerPoint (PPTX), Bilder (PNG, JPG, AVIF) und Textdateien sind erlaubt.';
    }

    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `Datei ist zu groß. Maximum: 50MB. Ihre Datei: ${fileSizeMB}MB.`;
    }

    return null;
  }, []);

  // Handle URL input changes
  const handleUrlChange = useCallback((url: string) => {
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
  const handleFileSelect = useCallback((files: File[]) => {
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
  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files) as File[];
    handleFileSelect(files);
  }, [handleFileSelect]);

  // Handle file input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    handleFileSelect(files);
  }, [handleFileSelect]);

  const handleWolkeFilesSelected = (files: WolkeSelectedFile[]) => {
    setSelectedWolkeFiles(files);
    // Always auto-generate title based on selection
    if (files.length === 1) {
      const fileName = files[0].name;
      const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
      setUploadTitle(nameWithoutExtension);
    } else if (files.length > 1) {
      setUploadTitle(`${files.length} Wolke-Dateien`);
    } else {
      // Clear title when no files selected
      setUploadTitle('');
    }
  };

  // Handle upload (file, URL, or Wolke)
  const handleUpload = async () => {
    if (uploadMode === 'file') {
      if (!selectedFile || !uploadTitle.trim()) {
        alert('Bitte wählen Sie eine Datei und geben Sie einen Titel ein.');
        return;
      }

      try {
        console.log('[DocumentUpload] Starting file upload process...');
        const result = await uploadDocument(selectedFile, uploadTitle.trim(), groupId);
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
    } else if (uploadMode === 'wolke') {
      if (selectedWolkeFiles.length === 0 || !uploadTitle.trim()) {
        alert('Bitte wählen Sie Wolke-Dateien aus und geben Sie einen Titel ein.');
        return;
      }

      try {
        console.log('[DocumentUpload] Starting Wolke import process...');
        const wolkeFilesForImport = selectedWolkeFiles.map(file => ({
          href: file.path,
          name: file.name,
          fileExtension: file.fileExtension,
          isSupported: file.isSupported,
          sizeFormatted: file.sizeFormatted,
          lastModified: file.lastModified || '',
          shareLinkId: file.shareLinkId,
        }));
        const result = await importWolkeFiles(
          selectedWolkeFiles[0].shareLinkId,
          wolkeFilesForImport,
          setWolkeImportProgress
        );
        console.log('[DocumentUpload] Wolke import successful, hiding form and calling onUploadComplete');
        resetForm();

        if (onUploadComplete) {
          onUploadComplete(result);
        }
      } catch (error) {
        console.error('[DocumentUpload] Wolke import failed:', error);
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
    setSelectedWolkeFiles([]);
    setWolkeImportProgress(0);
  };

  // Handle hover over Wolke tab to accelerate preloading
  const handleWolkeModeHover = useCallback(() => {
    if (user) {
      // Immediately start/accelerate Wolke preloading on hover
      progressivePreload();
    }
  }, [user, progressivePreload]);

  // Handle delete
  const handleDelete = async (documentId: string, documentTitle: string) => {
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
  const handleRefresh = async (documentId: string) => {
    try {
      await refreshDocument(documentId);
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
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
  const getStatusText = (status: string): string => {
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
            <div className="document-preview-overlay" onClick={(e: React.MouseEvent) => {
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
                  {/* Mode Selector */}
                  <div className="upload-mode-selector" style={{ marginBottom: 'var(--spacing-medium)' }}>
                    <div className="mode-tabs">
                      <button
                        type="button"
                        className={`mode-tab ${uploadMode === 'file' ? 'active' : ''}`}
                        onClick={() => setUploadMode('file')}
                        disabled={isUploading}
                      >
                        <HiOutlineDocumentAdd className="icon" />
                        Datei
                      </button>
                      <button
                        type="button"
                        className={`mode-tab ${uploadMode === 'url' ? 'active' : ''}`}
                        onClick={() => setUploadMode('url')}
                        disabled={isUploading}
                      >
                        <HiOutlineLink className="icon" />
                        URL
                      </button>
                      {/* Wolke tab temporarily hidden
                      <button
                        type="button"
                        className={`mode-tab ${uploadMode === 'wolke' ? 'active' : ''}`}
                        onClick={() => setUploadMode('wolke')}
                        onMouseEnter={handleWolkeModeHover}
                        disabled={isUploading}
                      >
                        <HiOutlineCloudDownload className="icon" />
                        Wolke
                      </button>
                      */}
                    </div>
                  </div>

                  {uploadMode === 'file' ? (
                    <>
                      <div className="form-field-wrapper">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.avif,.txt,.md"
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
                              <p>PDF, Word (DOCX), PowerPoint (PPTX), Bilder oder Textdateien hier ablegen oder klicken zum Auswählen</p>
                              <p className="file-requirements">Max. 1.000 Seiten, 50MB</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : uploadMode === 'url' ? (
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUrlChange(e.target.value)}
                          placeholder="https://example.com/article"
                          disabled={isUploading}
                        />
                        <p className="field-help">
                          Geben Sie die URL einer Website ein, die gecrawlt werden soll.
                          Der Inhalt wird automatisch extrahiert und als Dokument hinzugefügt.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Wolke Import */}
                      <div className="form-field-wrapper">
                        <label className="form-label">
                          Wolke-Dateien auswählen *
                        </label>
                        <WolkeFilePicker
                          onFilesSelected={handleWolkeFilesSelected}
                          onCancel={() => { }} // No cancel needed for inline mode
                          selectedFiles={selectedWolkeFiles}
                          inline={true}
                        />
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUploadTitle(e.target.value)}
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
                    className="btn-primary size-s"
                    disabled={isUploading ||
                      (uploadMode === 'file' && (!selectedFile || !uploadTitle.trim())) ||
                      (uploadMode === 'url' && (!urlInput.trim() || !uploadTitle.trim())) ||
                      (uploadMode === 'wolke' && (selectedWolkeFiles.length === 0 || !uploadTitle.trim()))
                    }
                  >
                    {isUploading ? (
                      <>
                        <Spinner size="small" />
                        {uploadMode === 'file' ? 'Wird hochgeladen...' :
                          uploadMode === 'url' ? 'Website wird verarbeitet...' :
                            'Wolke-Dateien werden importiert...'}
                      </>
                    ) : (
                      uploadMode === 'file' ? 'Hochladen' :
                        uploadMode === 'url' ? 'Website crawlen' :
                          'Wolke-Dateien importieren'
                    )}
                  </button>
                  {uploadMode === 'file' && selectedFile && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-primary size-s"
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
                    className="btn-primary size-s"
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
              {/* Mode Selector */}
              <div className="upload-mode-selector" style={{ marginBottom: 'var(--spacing-medium)' }}>
                <div className="mode-tabs">
                  <button
                    type="button"
                    className={`mode-tab ${uploadMode === 'file' ? 'active' : ''}`}
                    onClick={() => setUploadMode('file')}
                    disabled={isUploading}
                  >
                    <HiOutlineDocumentAdd className="icon" />
                    Datei
                  </button>
                  <button
                    type="button"
                    className={`mode-tab ${uploadMode === 'url' ? 'active' : ''}`}
                    onClick={() => setUploadMode('url')}
                    disabled={isUploading}
                  >
                    <HiOutlineLink className="icon" />
                    URL
                  </button>
                  {/* Wolke tab temporarily hidden
                  <button
                    type="button"
                    className={`mode-tab ${uploadMode === 'wolke' ? 'active' : ''}`}
                    onClick={() => setUploadMode('wolke')}
                    onMouseEnter={handleWolkeModeHover}
                    disabled={isUploading}
                  >
                    <HiOutlineCloudDownload className="icon" />
                    Wolke
                  </button>
                  */}
                </div>
              </div>

              {uploadMode === 'file' ? (
                <>
                  <div className="form-field-wrapper">
                    <label className="form-label">
                      Datei hochladen
                    </label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.avif,.txt,.md"
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
                          <p>PDF, Word (DOCX), PowerPoint (PPTX), Bilder oder Textdateien hier ablegen oder klicken zum Auswählen</p>
                          <p className="file-requirements">Max. 1.000 Seiten, 50MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : uploadMode === 'url' ? (
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUrlChange(e.target.value)}
                      placeholder="https://example.com/article"
                      disabled={isUploading}
                    />
                    <p className="field-help">
                      Geben Sie die URL einer Website ein, die gecrawlt werden soll.
                      Der Inhalt wird automatisch extrahiert und als Dokument hinzugefügt.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Wolke Import */}
                  <div className="form-field-wrapper">
                    <label className="form-label">
                      Wolke-Dateien auswählen *
                    </label>
                    <WolkeFilePicker
                      onFilesSelected={handleWolkeFilesSelected}
                      onCancel={() => { }} // No cancel needed for inline mode
                      selectedFiles={selectedWolkeFiles}
                      inline={true}
                    />
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUploadTitle(e.target.value)}
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
              <div className="profile-actions" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                <button
                  onClick={handleUpload}
                  className="btn-primary size-s"
                  disabled={isUploading ||
                    (uploadMode === 'file' && (!selectedFile || !uploadTitle.trim())) ||
                    (uploadMode === 'url' && (!urlInput.trim() || !uploadTitle.trim())) ||
                    (uploadMode === 'wolke' && (selectedWolkeFiles.length === 0 || !uploadTitle.trim()))
                  }
                >
                  {isUploading ? (
                    <>
                      <Spinner size="small" />
                      {uploadMode === 'file' ? 'Wird hochgeladen...' :
                        uploadMode === 'url' ? 'Website wird verarbeitet...' :
                          'Wolke-Dateien werden importiert...'}
                    </>
                  ) : (
                    uploadMode === 'file' ? 'Hochladen' :
                      uploadMode === 'url' ? 'Website crawlen' :
                        'Wolke-Dateien importieren'
                  )}
                </button>
                {uploadMode === 'file' && selectedFile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-primary size-s"
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
                Laden Sie PDF, Word (DOCX), PowerPoint (PPTX), Bilder oder Textdateien hoch, um sie als Wissensquelle zu nutzen.
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
                        {(document.page_count ?? 0) > 0 && (
                          <span className="document-pages">{document.page_count} Seiten</span>
                        )}
                        <span className="document-date">
                          {document.created_at && new Date(document.created_at).toLocaleDateString('de-DE')}
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
