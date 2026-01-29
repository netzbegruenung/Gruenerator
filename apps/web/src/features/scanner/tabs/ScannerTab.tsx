/**
 * Scanner Tab - OCR Text Extraction
 * Extracts the existing scanner logic into a separate tab component
 */

import { motion, AnimatePresence } from 'motion/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { HiX } from 'react-icons/hi';
import { PiScan, PiX, PiArrowCounterClockwise } from 'react-icons/pi';

import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import { FormStateProvider } from '../../../components/common/Form/FormStateProvider';
import SubmitButton from '../../../components/common/SubmitButton';
import apiClient from '../../../components/utils/apiClient';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import {
  uploadZoneVariants,
  ScanLine,
  TypewriterText,
  AnimatedUploadIcon,
  AnimatedFileIcon,
  ProcessingSpinner,
} from '../ScannerAnimations';

interface ScannerResult {
  text: string;
  pageCount: number;
  method: string;
  fileInfo: {
    originalname: string;
    size: number;
    mimetype: string;
  };
}

type ScannerState = 'upload' | 'ready' | 'processing' | 'success' | 'error';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.docx', '.pptx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const processingMessages = [
  'Dokument wird analysiert',
  'Text wird erkannt',
  'Seiten werden verarbeitet',
  'Formatierung wird beibehalten',
];

const COMPONENT_NAME = 'scanner';

const ScannerTab = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scannerState, setScannerState] = useState<ScannerState>('upload');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [processingMessageIndex, setProcessingMessageIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setGeneratedText = useGeneratedTextStore((state) => state.setGeneratedText);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  useEffect(() => {
    if (scannerState !== 'processing') return;

    const interval = setInterval(() => {
      setProcessingMessageIndex((prev) => (prev + 1) % processingMessages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [scannerState]);

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Ungültiger Dateityp. Erlaubt sind: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Datei ist zu groß. Maximale Größe: 50MB`;
    }
    return null;
  };

  const handleFileSelect = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setScannerState('error');
      return;
    }
    setSelectedFile(file);
    setError(null);
    setResult(null);
    setScannerState('ready');
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setScannerState('upload');
    clearGeneratedText(COMPONENT_NAME);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;

    setScannerState('processing');
    setError(null);
    setProcessingMessageIndex(0);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await apiClient.post('/scanner/extract', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        setResult(response.data);
        setScannerState('success');
        setGeneratedText(COMPONENT_NAME, response.data.text, {
          title: selectedFile.name,
          contentType: 'scanner',
        });
      } else {
        setError(response.data.error || 'Fehler bei der Textextraktion');
        setScannerState('error');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || 'Fehler bei der Textextraktion');
      setScannerState('error');
    }
  };

  const isProcessing = scannerState === 'processing';
  const hasResult = scannerState === 'success' && result;

  return (
    <div className="scanner-tab-content">
      <AnimatePresence mode="wait">
        {/* Upload State */}
        {(scannerState === 'upload' || scannerState === 'error') && !selectedFile && (
          <motion.div
            key="upload-zone"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className={`scanner-upload-zone ${isDragOver ? 'drag-over' : ''}`}
              variants={uploadZoneVariants}
              initial="idle"
              whileHover="hover"
              animate={isDragOver ? 'dragOver' : 'idle'}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleUploadClick();
                }
              }}
            >
              {isDragOver && (
                <svg className="scanner-marching-ants" preserveAspectRatio="none">
                  <motion.rect
                    x="2"
                    y="2"
                    width="calc(100% - 4px)"
                    height="calc(100% - 4px)"
                    rx="16"
                    ry="16"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    strokeDasharray="8 4"
                    initial={{ strokeDashoffset: 0 }}
                    animate={{ strokeDashoffset: -24 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                </svg>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleInputChange}
                className="scanner-file-input"
                aria-label="Datei auswählen"
              />

              <div className="scanner-upload-content">
                <AnimatedUploadIcon isDragOver={isDragOver} hasFile={false} />
                <p className="scanner-upload-text">
                  {isDragOver ? (
                    'Datei loslassen'
                  ) : (
                    <>
                      Datei hierher ziehen oder <span>durchsuchen</span>
                    </>
                  )}
                </p>
                <p className="scanner-upload-hint">PDF, Bilder, DOCX, PPTX · Max. 50 MB</p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Ready State - File Selected */}
        {scannerState === 'ready' && selectedFile && (
          <motion.div
            key="ready-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="scanner-ready-state"
          >
            <div className="scanner-selected-file">
              <AnimatedFileIcon isVisible />
              <div className="scanner-file-info">
                <span className="scanner-file-name">{selectedFile.name}</span>
                <span className="scanner-file-size">{formatFileSize(selectedFile.size)}</span>
              </div>
              <button
                className="scanner-clear-btn"
                onClick={handleClearFile}
                aria-label="Datei entfernen"
              >
                <PiX />
              </button>
            </div>

            <SubmitButton
              text="Text extrahieren"
              loading={false}
              icon={<PiScan />}
              onClick={handleExtract}
              className="scanner-extract-btn"
              type="button"
            />
          </motion.div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <motion.div
            key="processing-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="scanner-processing-state"
          >
            <div className="scanner-processing-visual">
              <div className="scanner-document-preview">
                <AnimatedFileIcon isVisible />
                <ScanLine isActive />
              </div>
              <ProcessingSpinner />
            </div>
            <p className="scanner-processing-text">
              <TypewriterText
                text={processingMessages[processingMessageIndex] + '...'}
                isActive
                speed={40}
              />
            </p>
          </motion.div>
        )}

        {/* Success State - Results with DisplaySection */}
        {hasResult && (
          <motion.div
            key="results-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="scanner-results-state"
          >
            <div className="scanner-result-meta">
              <span className="scanner-meta-item">
                {result.pageCount} Seite{result.pageCount !== 1 ? 'n' : ''}
              </span>
              <span className="scanner-meta-divider">·</span>
              <span className="scanner-meta-item">
                {result.text.length.toLocaleString()} Zeichen
              </span>
            </div>

            <FormStateProvider>
              <DisplaySection
                title={selectedFile?.name || 'Gescannter Text'}
                value={result.text}
                componentName={COMPONENT_NAME}
                useMarkdown={true}
                showEditModeToggle={false}
                showUndoControls={false}
                showRedoControls={false}
              />
            </FormStateProvider>

            <button className="scanner-new-btn" onClick={handleClearFile} type="button">
              <PiArrowCounterClockwise />
              <span>Neuen Scan starten</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            role="alert"
            aria-live="assertive"
            className="form-error-message scanner-error"
          >
            <span className="error-message-text">{error}</span>
            <button
              type="button"
              className="error-dismiss-button"
              onClick={() => {
                setError(null);
                if (!selectedFile) setScannerState('upload');
              }}
              aria-label="Fehlermeldung schließen"
            >
              <HiX size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ScannerTab;
