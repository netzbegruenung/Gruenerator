/**
 * Scanner Tab - OCR Text Extraction
 * Extracts the existing scanner logic into a separate tab component
 */

import {
  scannerExtractResponseSchema,
  type OcrProvider,
  type ScannerExtractResponse,
} from '@gruenerator/contracts';
import { FeatureToggle } from '@gruenerator/ui';
import { motion, AnimatePresence } from 'motion/react';
import { lazy, Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { HiX } from 'react-icons/hi';
import { PiCamera, PiNotePencil, PiScan, PiUploadSimple, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import SubmitButton from '../../../components/common/SubmitButton';
import apiClient from '../../../components/utils/apiClient';
import { extractHTMLContent } from '../../../components/utils/contentExtractor';
import useResponsive from '../../../hooks/useResponsive';
import { cn } from '../../../utils/cn';
import { uploadZoneVariants, AnimatedUploadIcon, AnimatedFileIcon } from '../ScannerAnimations';

const CameraScanner = lazy(() => import('../CameraScanner'));

type ScannerState = 'upload' | 'ready' | 'processing' | 'error';

// Handwriting must force Mistral: Docling can't read handwritten scans and the
// backend default (env.OCR_PROVIDER) is Docling in production, so relying on the
// default silently routed handwriting to Docling → near-empty documents.
const OCR_PROVIDER_FOR_HANDWRITING: OcrProvider = 'mistral';
const OCR_PROVIDER_FOR_PRINT: OcrProvider = 'docling';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.docx', '.pptx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_PAGES = 20;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ScannerTab = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scannerState, setScannerState] = useState<ScannerState>('upload');
  const [processingLabel, setProcessingLabel] = useState('Text wird extrahiert …');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [useHandwriting, setUseHandwriting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { isMobileView } = useResponsive(768);
  const navigate = useNavigate();

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
    setScannerState('ready');
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
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
    // Reset the input so selecting the same file again still fires onChange.
    e.target.value = '';
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

  const handleExtract = async () => {
    if (selectedFiles.length === 0) return;

    setScannerState('processing');
    setProcessingLabel('Text wird extrahiert …');
    setError(null);

    try {
      const texts: string[] = [];
      let totalPages = 0;

      const provider: OcrProvider = useHandwriting
        ? OCR_PROVIDER_FOR_HANDWRITING
        : OCR_PROVIDER_FOR_PRINT;

      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post<unknown>(
          `/scanner/extract?provider=${provider}`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        const parsed: ScannerExtractResponse = scannerExtractResponseSchema.parse(response.data);
        if (!parsed.success) {
          setError(parsed.error || `Fehler bei "${file.name}"`);
          setScannerState('error');
          return;
        }

        totalPages += parsed.pageCount;
        if (totalPages > MAX_PAGES) {
          setError(
            `Seitenlimit überschritten: maximal ${MAX_PAGES} Seiten erlaubt (${totalPages} Seiten erkannt).`
          );
          setScannerState('error');
          return;
        }
        texts.push(parsed.text);
      }

      const combinedText =
        texts.length === 1
          ? texts[0]
          : texts.map((text, i) => `**${selectedFiles[i].name}**\n\n${text}`).join('\n\n---\n\n');

      if (!combinedText.trim()) {
        setError('Es konnte kein Text aus den Dateien extrahiert werden.');
        setScannerState('error');
        return;
      }

      // Hand off directly to a document: convert to HTML, create the doc, then open it.
      setProcessingLabel('Dokument wird erstellt …');
      const title =
        selectedFiles.length === 1
          ? selectedFiles[0].name.replace(/\.[^.]+$/, '')
          : `${selectedFiles.length} Dateien`;
      const html = await extractHTMLContent(combinedText);
      const docResponse = await apiClient.post<{ documentId: string }>('/docs/from-export', {
        content: html,
        title,
        documentType: 'blank',
      });

      void navigate(`/office/${docResponse.data.documentId}`);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setError(error.response?.data?.error || error.message || 'Fehler bei der Textextraktion');
      setScannerState('error');
    }
  };

  const isProcessing = scannerState === 'processing';

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[640px] flex-1 content-center px-md py-lg',
        isDragOver && 'drag-over'
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        className="hidden"
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
              <div className="flex justify-center gap-md px-6 py-12">
                <button
                  className="flex h-[140px] w-[140px] flex-col items-center justify-center gap-sm rounded-lg border border-grey-200 bg-background text-foreground transition-[border-color,background] duration-200 [-webkit-tap-highlight-color:transparent] active:border-primary active:bg-primary-50 dark:border-grey-700 dark:active:bg-primary-900"
                  onClick={() => setShowCamera(true)}
                  type="button"
                >
                  <PiCamera size={36} />
                  <span className="text-[0.9375rem] font-medium">Kamera</span>
                </button>
                <button
                  className="flex h-[140px] w-[140px] flex-col items-center justify-center gap-sm rounded-lg border border-grey-200 bg-background text-foreground transition-[border-color,background] duration-200 [-webkit-tap-highlight-color:transparent] active:border-primary active:bg-primary-50 dark:border-grey-700 dark:active:bg-primary-900"
                  onClick={handleUploadClick}
                  type="button"
                >
                  <PiUploadSimple size={36} />
                  <span className="text-[0.9375rem] font-medium">Dateien</span>
                </button>
              </div>
            ) : (
              <motion.div
                className="relative cursor-pointer rounded-[20px] border-none bg-transparent px-12 py-16 text-center focus:outline-none focus-visible:rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary max-md:rounded-2xl max-md:px-8 max-md:py-12 max-[480px]:rounded-xl max-[480px]:px-6 max-[480px]:py-10"
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
                <div className="flex flex-col items-center gap-sm">
                  <AnimatedUploadIcon isDragOver={isDragOver} />
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Ready State - Files Selected */}
        {selectedFiles.length > 0 && scannerState !== 'processing' && (
          <motion.div
            key="ready-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="flex flex-col gap-lg"
          >
            <div className="flex flex-col gap-sm">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center gap-md rounded-lg border border-grey-200 bg-background p-md dark:border-grey-700 max-md:px-md max-md:py-sm"
                >
                  <AnimatedFileIcon isVisible />
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    <span className="max-w-full truncate text-base font-semibold text-foreground">
                      {file.name}
                    </span>
                    <span className="text-[0.8125rem] font-normal uppercase tracking-[0.02em] text-grey-400">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <button
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-grey-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    onClick={() => handleRemoveFile(index)}
                    aria-label={`${file.name} entfernen`}
                  >
                    <PiX />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              {isMobileView && (
                <button
                  className="cursor-pointer rounded-md border-none bg-none px-sm py-xs text-sm font-medium text-primary transition-colors duration-200 hover:bg-primary-50 dark:hover:bg-primary-900"
                  onClick={() => setShowCamera(true)}
                  type="button"
                >
                  <PiCamera size={16} /> Foto aufnehmen
                </button>
              )}
              <button
                className="flex size-9 cursor-pointer items-center justify-center rounded-full border border-grey-200 bg-transparent text-lg text-foreground transition-colors duration-200 hover:border-secondary-600 hover:text-secondary-600 dark:border-grey-700 dark:hover:border-secondary-600"
                onClick={handleUploadClick}
                type="button"
                aria-label="Weitere Dateien hinzufügen"
              >
                +
              </button>
            </div>

            <FeatureToggle
              isActive={useHandwriting}
              onToggle={setUseHandwriting}
              label="Handschrift erkennen"
              icon={PiNotePencil}
              description="Aktiviere diesen Modus, um handschriftliche Texte zu erkennen. Dabei werden die Daten an einen externen Dienst (Mistral) gesendet."
              noBorder
            />

            <SubmitButton
              text={
                selectedFiles.length === 1
                  ? 'Text extrahieren'
                  : `${selectedFiles.length} Dateien extrahieren`
              }
              loading={false}
              icon={<PiScan />}
              onClick={handleExtract}
              className="w-full"
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
            className="flex items-center justify-center px-xl py-2xl max-md:px-md max-md:py-xl"
          >
            <p className="m-0 text-base text-grey-500">{processingLabel}</p>
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
            className="m-0 flex items-center justify-between gap-sm rounded-lg border border-error bg-error/10 px-md py-sm font-medium text-error dark:border-[rgba(211,47,47,0.6)] dark:bg-[rgba(211,47,47,0.15)]"
          >
            <span className="flex-1 leading-[1.4]">{error}</span>
            <button
              type="button"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-xxs text-error opacity-70 transition-all hover:scale-105 hover:bg-error/10 hover:opacity-100 active:scale-95"
              onClick={() => {
                setError(null);
                setScannerState(selectedFiles.length === 0 ? 'upload' : 'ready');
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
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-md text-white">
                <div className="size-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
                <p className="m-0 text-base opacity-80">Kamera wird geladen...</p>
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
