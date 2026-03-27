import { Button, Input } from '@gruenerator/ui';
import { useShareLinks, type WolkeFileItem } from '@gruenerator/wolke';
import React, { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  HiOutlineDocumentAdd,
  HiOutlineTrash,
  HiRefresh,
  HiDocumentText,
  HiClock,
  HiCheckCircle,
  HiExclamationCircle,
  HiEye,
  HiX,
  HiOutlineLink,
  HiOutlineCloudDownload,
} from 'react-icons/hi';

import { useOptimizedAuth } from '../../hooks/useAuth';
import { useDocumentsStore } from '../../stores/documentsStore';
import { cn } from '../../utils/cn';
import { validateUrl, normalizeUrl, generateTitleFromUrl } from '../../utils/urlValidation';
import apiClient from '../utils/apiClient';

import FeatureToggle from './FeatureToggle';
import { Markdown } from './Markdown';
import Spinner from './Spinner';
import WolkeFilePicker from './WolkeFilePicker/WolkeFilePicker';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  'image/png',
  'image/jpeg',
  'image/avif',
  'text/plain',
  'text/markdown',
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
  allowedUploadModes?: ('file' | 'url' | 'wolke')[];
  autoUpload?: boolean;
}

export interface DocumentUploadRef {
  showUploadForm: () => void;
  hideUploadForm: () => void;
}

interface WolkeSelectedFile extends WolkeFileItem {
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
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-md backdrop-blur-[4px]"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-background rounded-2xl shadow-xl max-w-[800px] max-h-[90vh] w-full flex flex-col overflow-hidden"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-lg py-md border-b border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800">
              <h4 className="m-0 text-foreground-heading text-[1.1rem] font-medium flex-1 min-w-0 break-words">
                Text-Vorschau: {document.title}
              </h4>
              <button
                onClick={() => setShowPreview(false)}
                className="icon-button"
                title="Schließen"
              >
                <HiX />
              </button>
            </div>

            <div className="p-lg overflow-y-auto flex-1">
              {error ? (
                <div className="flex items-center gap-xs text-red-600 text-[0.9rem]">
                  <HiExclamationCircle />
                  {error}
                </div>
              ) : (
                <div className="leading-relaxed text-foreground text-[0.9rem]">
                  <Markdown>{previewText}</Markdown>
                </div>
              )}
            </div>

            <div className="px-lg py-md border-t border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800">
              <span className="text-sm text-grey-500 dark:text-grey-400">
                {document.page_count} Seiten • {previewText.length} Zeichen
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const DocumentUpload = forwardRef<DocumentUploadRef, DocumentUploadProps>(
  (
    {
      groupId = null,
      onUploadComplete = null,
      onDeleteComplete = null,
      showTitle = true,
      showDocumentsList = true,
      forceShowUploadForm = false,
      showAsModal = false,
      className = '',
      allowedUploadModes,
      autoUpload = false,
    },
    ref
  ) => {
    const [dragActive, setDragActive] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [ocrMethod, setOcrMethod] = useState('tesseract');

    // Upload mode state
    const [uploadMode, setUploadMode] = useState<'file' | 'url' | 'wolke'>('file');
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
      importWolkeFiles,
    } = useDocumentsStore();

    // Prefetch Wolke share links via TanStack Query (replaces manual preload)
    useShareLinks();

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      showUploadForm: () => setShowUploadForm(true),
      hideUploadForm: () => setShowUploadForm(false),
    }));

    // Fetch documents on mount (only when showing the documents list)
    React.useEffect(() => {
      if (user && showDocumentsList) {
        fetchDocuments();
      }
    }, [user, showDocumentsList, fetchDocuments]);

    // Clear stale errors when embedded without documents list
    React.useEffect(() => {
      if (!showDocumentsList && error) {
        clearError();
      }
    }, [showDocumentsList, error, clearError]);

    // TanStack Query handles Wolke data preloading automatically via useShareLinks()

    // Auto-upload: trigger upload immediately when file is selected
    React.useEffect(() => {
      if (autoUpload && selectedFile && uploadTitle.trim() && !isUploading) {
        handleUpload();
      }
      // Only react to file selection changes, not every render
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoUpload, selectedFile]);

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
    const handleUrlChange = useCallback(
      (url: string) => {
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
      },
      [uploadTitle, clearError]
    );

    // Handle file selection
    const handleFileSelect = useCallback(
      (files: File[]) => {
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
      },
      [validateFile, clearError]
    );

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
    const handleDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const files = Array.from(e.dataTransfer.files) as File[];
        handleFileSelect(files);
      },
      [handleFileSelect]
    );

    // Handle file input change
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        handleFileSelect(files);
      },
      [handleFileSelect]
    );

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
          const result = await uploadDocument(selectedFile, uploadTitle.trim(), groupId);
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
          const result = await crawlUrl(normalizedUrl, uploadTitle.trim(), groupId);
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
          const wolkeFilesForImport = selectedWolkeFiles.map((file) => ({
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
            <Button
              variant="brand"
              size="brand-sm"
              type="button"
              onClick={() => setShowUploadForm(true)}
              disabled={isUploading}
            >
              <HiOutlineDocumentAdd className="icon" /> Inhalt hinzufügen
            </Button>
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
            {showAsModal ? (
              /* Modal Upload Form */
              <div
                className="document-preview-overlay"
                onClick={(e: React.MouseEvent) => {
                  if (e.target === e.currentTarget) {
                    if (forceShowUploadForm) {
                      // When controlled by parent, notify parent to close
                      onUploadComplete?.(null);
                    } else {
                      setShowUploadForm(false);
                      setSelectedFile(null);
                      setUploadTitle('');
                    }
                  }
                }}
              >
                <div className="document-preview-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="document-preview-header">
                    <h3>Dokument hochladen</h3>
                    <button
                      className="document-preview-close"
                      onClick={() => {
                        if (forceShowUploadForm) {
                          // When controlled by parent, notify parent to close
                          onUploadComplete?.(null);
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
                    {/* Mode Selector - hide when only one mode allowed */}
                    {(!allowedUploadModes || allowedUploadModes.length > 1) && (
                      <div className="mb-md">
                        <div className="flex gap-xxs bg-background-alt rounded-lg p-xxs border border-grey-200 dark:border-grey-700">
                          {(!allowedUploadModes || allowedUploadModes.includes('file')) && (
                            <button
                              type="button"
                              className={cn(
                                'flex-1 flex items-center justify-center gap-xs px-md py-sm bg-transparent border-none rounded-md text-foreground text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-hover-alt disabled:opacity-60 disabled:cursor-not-allowed',
                                uploadMode === 'file' &&
                                  'bg-secondary-600 text-white hover:bg-secondary-600'
                              )}
                              onClick={() => setUploadMode('file')}
                              disabled={isUploading}
                            >
                              <HiOutlineDocumentAdd className="text-base" />
                              Datei
                            </button>
                          )}
                          {(!allowedUploadModes || allowedUploadModes.includes('url')) && (
                            <button
                              type="button"
                              className={cn(
                                'flex-1 flex items-center justify-center gap-xs px-md py-sm bg-transparent border-none rounded-md text-foreground text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-hover-alt disabled:opacity-60 disabled:cursor-not-allowed',
                                uploadMode === 'url' &&
                                  'bg-secondary-600 text-white hover:bg-secondary-600'
                              )}
                              onClick={() => setUploadMode('url')}
                              disabled={isUploading}
                            >
                              <HiOutlineLink className="text-base" />
                              URL
                            </button>
                          )}
                          {/* Wolke tab temporarily hidden
                      <button
                        type="button"
                        className={cn(
                          'flex-1 flex items-center justify-center gap-xs px-md py-sm bg-transparent border-none rounded-md text-foreground text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-hover-alt disabled:opacity-60 disabled:cursor-not-allowed',
                          uploadMode === 'wolke' && 'bg-secondary-600 text-white hover:bg-secondary-600'
                        )}
                        onClick={() => setUploadMode('wolke')}

                        disabled={isUploading}
                      >
                        <HiOutlineCloudDownload className="text-base" />
                        Wolke
                      </button>
                      */}
                        </div>
                      </div>
                    )}

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
                              <span className="text-foreground break-words">
                                {selectedFile.name}
                              </span>
                            </div>
                          ) : (
                            <div
                              className={`border-2 border-dashed rounded-lg p-lg text-center cursor-pointer transition-all duration-200 ${dragActive ? 'border-primary-600 bg-background' : 'border-grey-300 dark:border-grey-600 bg-background-alt hover:border-primary-600 hover:bg-background'}`}
                              onDragEnter={handleDrag}
                              onDragLeave={handleDrag}
                              onDragOver={handleDrag}
                              onDrop={handleDrop}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <div className="file-placeholder">
                                <HiOutlineDocumentAdd className="text-5xl text-grey-400 mb-sm" />
                                <p>
                                  PDF, Word (DOCX), PowerPoint (PPTX), Bilder oder Textdateien hier
                                  ablegen oder klicken zum Auswählen
                                </p>
                                <p className="text-sm text-grey-400 mt-xs">
                                  Max. 1.000 Seiten, 50MB
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : uploadMode === 'url' ? (
                      <>
                        <div className="form-field-wrapper">
                          {/* URL Input */}
                          <label className="form-label">Website URL *</label>
                          <Input
                            type="url"
                            value={urlInput}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              handleUrlChange(e.target.value)
                            }
                            placeholder="https://example.com/article"
                            disabled={isUploading}
                          />
                          <p className="field-help">
                            Geben Sie die URL einer Website ein, die gecrawlt werden soll. Der
                            Inhalt wird automatisch extrahiert und als Dokument hinzugefügt.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Wolke Import */}
                        <div className="form-field-wrapper">
                          <label className="form-label">Wolke-Dateien auswählen *</label>
                          <WolkeFilePicker
                            onFilesSelected={handleWolkeFilesSelected}
                            onCancel={() => {}} // No cancel needed for inline mode
                            selectedFiles={selectedWolkeFiles}
                            inline={true}
                          />
                        </div>
                      </>
                    )}

                    {/* Title Input */}
                    {(selectedFile || (uploadMode === 'url' && urlInput.trim())) && (
                      <div className="form-field-wrapper">
                        <label className="form-label">Titel des Dokuments *</label>
                        <Input
                          type="text"
                          value={uploadTitle}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setUploadTitle(e.target.value)
                          }
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
                  <div className="px-lg py-md border-t border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800 flex justify-end gap-sm">
                    <Button
                      variant="brand"
                      size="brand-sm"
                      onClick={handleUpload}
                      disabled={
                        isUploading ||
                        (uploadMode === 'file' && (!selectedFile || !uploadTitle.trim())) ||
                        (uploadMode === 'url' && (!urlInput.trim() || !uploadTitle.trim())) ||
                        (uploadMode === 'wolke' &&
                          (selectedWolkeFiles.length === 0 || !uploadTitle.trim()))
                      }
                    >
                      {isUploading ? (
                        <>
                          <Spinner size="small" />
                          {uploadMode === 'file'
                            ? 'Wird hochgeladen...'
                            : uploadMode === 'url'
                              ? 'Website wird verarbeitet...'
                              : 'Wolke-Dateien werden importiert...'}
                        </>
                      ) : uploadMode === 'file' ? (
                        'Hochladen'
                      ) : uploadMode === 'url' ? (
                        'Website crawlen'
                      ) : (
                        'Wolke-Dateien importieren'
                      )}
                    </Button>
                    {uploadMode === 'file' && selectedFile && (
                      <Button
                        variant="brand"
                        size="brand-sm"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        Datei ändern
                      </Button>
                    )}
                    <Button
                      variant="brand"
                      size="brand-sm"
                      onClick={() => {
                        if (forceShowUploadForm) {
                          // When controlled by parent, notify parent to close
                          onUploadComplete?.(null);
                        } else {
                          resetForm();
                        }
                      }}
                      disabled={isUploading}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Inline Upload Form */
              <div
                className="knowledge-entry knowledge-entry-bordered"
                style={{ marginBottom: 'var(--spacing-medium)' }}
              >
                {/* Mode Selector - hide when only one mode allowed */}
                {(!allowedUploadModes || allowedUploadModes.length > 1) && (
                  <div className="mb-md">
                    <div className="flex gap-xxs bg-background-alt rounded-lg p-xxs border border-grey-200 dark:border-grey-700">
                      {(!allowedUploadModes || allowedUploadModes.includes('file')) && (
                        <button
                          type="button"
                          className={cn(
                            'flex-1 flex items-center justify-center gap-xs px-md py-sm bg-transparent border-none rounded-md text-foreground text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-hover-alt disabled:opacity-60 disabled:cursor-not-allowed',
                            uploadMode === 'file' &&
                              'bg-secondary-600 text-white hover:bg-secondary-600'
                          )}
                          onClick={() => setUploadMode('file')}
                          disabled={isUploading}
                        >
                          <HiOutlineDocumentAdd className="text-base" />
                          Datei
                        </button>
                      )}
                      {(!allowedUploadModes || allowedUploadModes.includes('url')) && (
                        <button
                          type="button"
                          className={cn(
                            'flex-1 flex items-center justify-center gap-xs px-md py-sm bg-transparent border-none rounded-md text-foreground text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-hover-alt disabled:opacity-60 disabled:cursor-not-allowed',
                            uploadMode === 'url' &&
                              'bg-secondary-600 text-white hover:bg-secondary-600'
                          )}
                          onClick={() => setUploadMode('url')}
                          disabled={isUploading}
                        >
                          <HiOutlineLink className="text-base" />
                          URL
                        </button>
                      )}
                      {/* Wolke tab temporarily hidden
                  <button
                    type="button"
                    className={cn(
                      'flex-1 flex items-center justify-center gap-xs px-md py-sm bg-transparent border-none rounded-md text-foreground text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap hover:bg-hover-alt disabled:opacity-60 disabled:cursor-not-allowed',
                      uploadMode === 'wolke' && 'bg-secondary-600 text-white hover:bg-secondary-600'
                    )}
                    onClick={() => setUploadMode('wolke')}
                    onMouseEnter={handleWolkeModeHover}
                    disabled={isUploading}
                  >
                    <HiOutlineCloudDownload className="text-base" />
                    Wolke
                  </button>
                  */}
                    </div>
                  </div>
                )}

                {uploadMode === 'file' ? (
                  <>
                    <div className="form-field-wrapper">
                      <label className="form-label">Datei hochladen</label>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.avif,.txt,.md"
                        onChange={handleInputChange}
                        style={{ display: 'none' }}
                      />

                      {selectedFile ? (
                        autoUpload ? (
                          <div className="border-2 border-dashed border-grey-300 dark:border-grey-600 rounded-lg p-lg text-center bg-background-alt">
                            <Spinner size="small" />
                            <span className="auto-upload-filename">{selectedFile.name}</span>
                            <span className="auto-upload-status">Wird hochgeladen…</span>
                          </div>
                        ) : (
                          <div className="file-selected-simple">
                            <span className="text-foreground break-words">{selectedFile.name}</span>
                          </div>
                        )
                      ) : (
                        <div
                          className={`border-2 border-dashed rounded-lg p-lg text-center cursor-pointer transition-all duration-200 ${dragActive ? 'border-primary-600 bg-background' : 'border-grey-300 dark:border-grey-600 bg-background-alt hover:border-primary-600 hover:bg-background'}`}
                          onDragEnter={handleDrag}
                          onDragLeave={handleDrag}
                          onDragOver={handleDrag}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <div className="file-placeholder">
                            <HiOutlineDocumentAdd className="text-5xl text-grey-400 mb-sm" />
                            <p>
                              PDF, Word (DOCX), PowerPoint (PPTX), Bilder oder Textdateien hier
                              ablegen oder klicken zum Auswählen
                            </p>
                            <p className="text-sm text-grey-400 mt-xs">Max. 1.000 Seiten, 50MB</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : uploadMode === 'url' ? (
                  <>
                    <div className="form-field-wrapper">
                      {/* URL Input */}
                      <label className="form-label">Website URL *</label>
                      <Input
                        type="url"
                        value={urlInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleUrlChange(e.target.value)
                        }
                        placeholder="https://example.com/article"
                        disabled={isUploading}
                      />
                      <p className="field-help">
                        Geben Sie die URL einer Website ein, die gecrawlt werden soll. Der Inhalt
                        wird automatisch extrahiert und als Dokument hinzugefügt.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Wolke Import */}
                    <div className="form-field-wrapper">
                      <label className="form-label">Wolke-Dateien auswählen *</label>
                      <WolkeFilePicker
                        onFilesSelected={handleWolkeFilesSelected}
                        onCancel={() => {}} // No cancel needed for inline mode
                        selectedFiles={selectedWolkeFiles}
                        inline={true}
                      />
                    </div>
                  </>
                )}

                {/* Title Input — hidden in autoUpload mode */}
                {!autoUpload && (selectedFile || (uploadMode === 'url' && urlInput.trim())) && (
                  <div className="form-field-wrapper">
                    <label className="form-label">Titel des Dokuments *</label>
                    <Input
                      type="text"
                      value={uploadTitle}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setUploadTitle(e.target.value)
                      }
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

                {/* Action Buttons — hidden in autoUpload mode */}
                {!autoUpload && (
                  <div
                    className="profile-actions"
                    style={{ justifyContent: 'flex-start', gap: '10px' }}
                  >
                    <Button
                      variant="brand"
                      size="brand-sm"
                      onClick={handleUpload}
                      disabled={
                        isUploading ||
                        (uploadMode === 'file' && (!selectedFile || !uploadTitle.trim())) ||
                        (uploadMode === 'url' && (!urlInput.trim() || !uploadTitle.trim())) ||
                        (uploadMode === 'wolke' &&
                          (selectedWolkeFiles.length === 0 || !uploadTitle.trim()))
                      }
                    >
                      {isUploading ? (
                        <>
                          <Spinner size="small" />
                          {uploadMode === 'file'
                            ? 'Wird hochgeladen...'
                            : uploadMode === 'url'
                              ? 'Website wird verarbeitet...'
                              : 'Wolke-Dateien werden importiert...'}
                        </>
                      ) : uploadMode === 'file' ? (
                        'Hochladen'
                      ) : uploadMode === 'url' ? (
                        'Website crawlen'
                      ) : (
                        'Wolke-Dateien importieren'
                      )}
                    </Button>
                    {uploadMode === 'file' && selectedFile && (
                      <Button
                        variant="brand"
                        size="brand-sm"
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        Datei ändern
                      </Button>
                    )}
                    <Button
                      variant="brand-outline"
                      size="brand"
                      onClick={() => {
                        if (forceShowUploadForm) {
                          // When controlled by parent, notify parent to close
                          onUploadComplete?.(null);
                        } else {
                          resetForm();
                        }
                      }}
                      disabled={isUploading}
                    >
                      Abbrechen
                    </Button>
                  </div>
                )}
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
                  Laden Sie PDF, Word (DOCX), PowerPoint (PPTX), Bilder oder Textdateien hoch, um
                  sie als Wissensquelle zu nutzen.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-md">
                {documents.map((document) => (
                  <div key={document.id} className="knowledge-entry knowledge-entry-bordered">
                    <div className="flex justify-between items-center gap-md min-h-[60px]">
                      <div className="flex-1 flex flex-col justify-center min-w-0">
                        <div className="flex items-center gap-xs font-medium mb-xs text-foreground text-[0.95rem] leading-snug overflow-hidden text-ellipsis whitespace-nowrap">
                          {getStatusIcon(document.status)}
                          <span>{document.title}</span>
                        </div>
                        <div className="flex gap-md text-sm text-grey-400 flex-wrap leading-tight m-0">
                          <span className="document-status">{getStatusText(document.status)}</span>
                          {(document.page_count ?? 0) > 0 && (
                            <span className="document-pages">{document.page_count} Seiten</span>
                          )}
                          <span className="document-date">
                            {document.created_at &&
                              new Date(document.created_at).toLocaleDateString('de-DE')}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-xs items-center">
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
                      <div className="flex items-center gap-xs text-red-600 text-sm mt-sm p-sm bg-background-alt rounded">
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
  }
);

export default DocumentUpload;
