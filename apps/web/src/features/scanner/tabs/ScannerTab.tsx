/**
 * Scanner Tab - OCR Text Extraction
 * Extracts the existing scanner logic into a separate tab component
 */

import { motion, AnimatePresence } from 'motion/react';
import { lazy, Suspense, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { HiX } from 'react-icons/hi';
import {
  PiCamera,
  PiListChecks,
  PiNotepad,
  PiScan,
  PiTextAa,
  PiUploadSimple,
  PiX,
} from 'react-icons/pi';

import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import UniversalEditForm from '../../../components/common/Form/EditMode/UniversalEditForm';
import { FormStateProvider } from '../../../components/common/Form/FormStateProvider';
import useResponsive from '../../../components/common/Form/hooks/useResponsive';
import SubmitButton from '../../../components/common/SubmitButton';
import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useApplyAiEdit from '../../../stores/hooks/useApplyAiEdit';
import { uploadZoneVariants, AnimatedUploadIcon, AnimatedFileIcon } from '../ScannerAnimations';

const CameraScanner = lazy(() => import('../CameraScanner'));

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
const MAX_PAGES = 20;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const COMPONENT_NAME = 'scanner';

const PARTY_NAMES: Record<string, string> = {
  'de-DE': 'Bündnis 90/Die Grünen',
  'de-AT': 'Die Grünen – Die Grüne Alternative',
};

const getTransformPresets = (partyName: string) => [
  {
    id: 'ergebnisprotokoll',
    label: 'Ergebnisprotokoll',
    instruction: `Der Text stammt aus dem Kontext der grünen Partei (${partyName}). Transformiere den Text in ein strukturiertes Ergebnisprotokoll. Gliedere die Inhalte in klare Abschnitte mit Überschriften. Fasse Ergebnisse, Beschlüsse und offene Punkte übersichtlich zusammen. Behalte alle faktischen Informationen bei.`,
    Icon: PiListChecks,
  },
  {
    id: 'notizen',
    label: 'Notizen',
    instruction: `Der Text stammt aus dem Kontext der grünen Partei (${partyName}). Fasse den Text als kompakte, übersichtliche Notizen zusammen. Verwende kurze Stichpunkte und Aufzählungen. Hebe die wichtigsten Informationen, Kernaussagen und Handlungspunkte hervor. Lasse unwichtige Details und Füllwörter weg.`,
    Icon: PiNotepad,
  },
  {
    id: 'text-korrigieren',
    label: 'Text korrigieren',
    instruction: `Der Text stammt aus dem Kontext der grünen Partei (${partyName}). Korrigiere Rechtschreibung, Grammatik und Zeichensetzung im Text. Behebe OCR-typische Fehler wie falsch erkannte Buchstaben, fehlende Leerzeichen oder zusammengezogene Wörter. Erkenne partei-spezifische Begriffe und Abkürzungen korrekt. Behalte den ursprünglichen Inhalt, Stil und die Struktur vollständig bei.`,
    Icon: PiTextAa,
  },
];

interface ScannerTabProps {
  onProcessingChange?: (isProcessing: boolean) => void;
}

const ScannerTab = ({ onProcessingChange }: ScannerTabProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scannerState, setScannerState] = useState<ScannerState>('upload');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditModeActive, setIsEditModeActive] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { isMobileView } = useResponsive(768);

  const locale = useAuthStore((state) => state.locale);
  const partyName = PARTY_NAMES[locale] || PARTY_NAMES['de-DE'];
  const transformPresets = useMemo(() => getTransformPresets(partyName), [partyName]);

  const setGeneratedText = useGeneratedTextStore((state) => state.setGeneratedText);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  const handleEditModeToggle = useCallback(() => {
    setIsEditModeActive((prev) => !prev);
  }, []);

  const { applyInstruction, isProcessing: isTransforming } = useApplyAiEdit(COMPONENT_NAME);

  const handleTransform = useCallback(
    async (instruction: string) => {
      const result = await applyInstruction(instruction);
      if (!result.success) {
        setError(result.error || 'Transformation fehlgeschlagen.');
      }
    },
    [applyInstruction]
  );

  useEffect(() => {
    onProcessingChange?.(scannerState === 'processing');
  }, [scannerState, onProcessingChange]);

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

  const handleFileSelect = useCallback((files: File[]) => {
    const valid: File[] = [];
    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setScannerState('error');
        return;
      }
      valid.push(file);
    }
    setSelectedFiles((prev) => [...prev, ...valid]);
    setError(null);
    setResult(null);
    setScannerState('ready');
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setResult(null);
        setError(null);
        setScannerState('upload');
      }
      return next;
    });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(Array.from(files));
    }
  };

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      setIsDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragOver(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFileSelect(Array.from(files));
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFileSelect]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraCapture = useCallback(
    (file: File) => {
      handleFileSelect([file]);
      setShowCamera(false);
    },
    [handleFileSelect]
  );

  const handleClearFile = () => {
    setSelectedFiles([]);
    setResult(null);
    setError(null);
    setIsEditModeActive(false);
    setScannerState('upload');
    clearGeneratedText(COMPONENT_NAME);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExtract = async () => {
    if (selectedFiles.length === 0) return;

    setScannerState('processing');
    setError(null);

    try {
      const results: ScannerResult[] = [];
      let totalPages = 0;

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post('/scanner/extract', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (response.data.success) {
          totalPages += response.data.pageCount;
          if (totalPages > MAX_PAGES) {
            setError(
              `Seitenlimit überschritten: maximal ${MAX_PAGES} Seiten erlaubt (${totalPages} Seiten erkannt).`
            );
            setScannerState('error');
            return;
          }
          results.push(response.data);
        } else {
          setError(response.data.error || `Fehler bei "${file.name}"`);
          setScannerState('error');
          return;
        }
      }

      const combinedText =
        results.length === 1
          ? results[0].text
          : results.map((r, i) => `**${selectedFiles[i].name}**\n\n${r.text}`).join('\n\n---\n\n');

      const combinedResult: ScannerResult = {
        text: combinedText,
        pageCount: totalPages,
        method: results[0].method,
        fileInfo: results[0].fileInfo,
      };

      setResult(combinedResult);
      setGeneratedText(COMPONENT_NAME, combinedText, {
        title:
          selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} Dateien`,
        contentType: 'scanner',
      });
      setScannerState('success');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || 'Fehler bei der Textextraktion');
      setScannerState('error');
    }
  };

  const isProcessing = scannerState === 'processing';
  const hasResult = scannerState === 'success' && result;

  return (
    <div className={`scanner-tab-content ${isDragOver ? 'drag-over' : ''}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        className="scanner-file-input"
        aria-label="Dateien auswählen"
        multiple
      />

      <AnimatePresence mode="wait">
        {/* Upload State */}
        {(scannerState === 'upload' || scannerState === 'error') && selectedFiles.length === 0 && (
          <motion.div
            key="upload-zone"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            {isMobileView ? (
              <div className="scanner-mobile-actions">
                <button
                  className="scanner-mobile-action-btn"
                  onClick={() => setShowCamera(true)}
                  type="button"
                >
                  <PiCamera size={36} />
                  <span className="scanner-mobile-action-label">Kamera</span>
                </button>
                <button
                  className="scanner-mobile-action-btn"
                  onClick={handleUploadClick}
                  type="button"
                >
                  <PiUploadSimple size={36} />
                  <span className="scanner-mobile-action-label">Dateien</span>
                </button>
              </div>
            ) : (
              <motion.div
                className={`scanner-upload-zone ${isDragOver ? 'drag-over' : ''}`}
                variants={uploadZoneVariants}
                initial="idle"
                whileHover="hover"
                animate={isDragOver ? 'dragOver' : 'idle'}
                onClick={handleUploadClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleUploadClick();
                  }
                }}
              >
                <div className="scanner-upload-content">
                  <AnimatedUploadIcon isDragOver={isDragOver} hasFile={false} />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Ready State - Files Selected */}
        {scannerState === 'ready' && selectedFiles.length > 0 && (
          <motion.div
            key="ready-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="scanner-ready-state"
          >
            <div className="scanner-file-list">
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="scanner-selected-file">
                  <AnimatedFileIcon isVisible />
                  <div className="scanner-file-info">
                    <span className="scanner-file-name">{file.name}</span>
                    <span className="scanner-file-size">{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    className="scanner-clear-btn"
                    onClick={() => handleRemoveFile(index)}
                    aria-label={`${file.name} entfernen`}
                  >
                    <PiX />
                  </button>
                </div>
              ))}
            </div>

            <div className="scanner-file-list-actions">
              {isMobileView && (
                <button
                  className="scanner-add-more-btn"
                  onClick={() => setShowCamera(true)}
                  type="button"
                >
                  <PiCamera size={16} /> Foto aufnehmen
                </button>
              )}
              <button className="scanner-add-more-btn" onClick={handleUploadClick} type="button">
                + Weitere Dateien
              </button>
            </div>

            <SubmitButton
              text={
                selectedFiles.length === 1
                  ? 'Text extrahieren'
                  : `${selectedFiles.length} Dateien extrahieren`
              }
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
            <p className="scanner-processing-text">Text wird extrahiert...</p>
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
              {selectedFiles.length > 1 && (
                <>
                  <span className="scanner-meta-item">{selectedFiles.length} Dateien</span>
                  <span className="scanner-meta-divider">·</span>
                </>
              )}
              <span className="scanner-meta-item">
                {result.pageCount} Seite{result.pageCount !== 1 ? 'n' : ''}
              </span>
              <span className="scanner-meta-divider">·</span>
              <span className="scanner-meta-item">
                {result.text.length.toLocaleString()} Zeichen
              </span>
            </div>

            <div className="scanner-results-layout">
              <div className="scanner-results-main">
                <FormStateProvider>
                  <DisplaySection
                    title={
                      selectedFiles.length === 1
                        ? selectedFiles[0].name
                        : `${selectedFiles.length} Dateien`
                    }
                    value={result.text}
                    componentName={COMPONENT_NAME}
                    useMarkdown={true}
                    showEditModeToggle={true}
                    isEditModeActive={isEditModeActive}
                    onEditModeToggle={handleEditModeToggle}
                    showUndoControls={true}
                    showRedoControls={true}
                    showResetButton={true}
                    onReset={handleClearFile}
                  />
                </FormStateProvider>

                {isEditModeActive && (
                  <UniversalEditForm
                    componentName={COMPONENT_NAME}
                    onClose={handleEditModeToggle}
                  />
                )}
              </div>

              <div className="scanner-transform-panel">
                {transformPresets.map((preset) => (
                  <button
                    key={preset.id}
                    className="scanner-transform-btn"
                    onClick={() => handleTransform(preset.instruction)}
                    disabled={isTransforming}
                  >
                    <preset.Icon />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
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
                if (selectedFiles.length === 0) setScannerState('upload');
              }}
              aria-label="Fehlermeldung schließen"
            >
              <HiX size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Overlay */}
      {showCamera && (
        <Suspense
          fallback={
            <div className="scanner-camera-overlay">
              <div className="scanner-camera-loading">
                <div className="scanner-camera-spinner" />
                <p>Kamera wird geladen...</p>
              </div>
            </div>
          }
        >
          <CameraScanner onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default ScannerTab;
