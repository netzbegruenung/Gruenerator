/**
 * Scanner Tab - OCR Text Extraction
 * Extracts the existing scanner logic into a separate tab component
 */

import { FeatureToggle } from '@gruenerator/ui';
import { motion, AnimatePresence } from 'motion/react';
import { lazy, Suspense, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { HiX } from 'react-icons/hi';
import {
  PiCamera,
  PiCheckSquare,
  PiKanban,
  PiListChecks,
  PiNotePencil,
  PiNotepad,
  PiScan,
  PiShieldCheck,
  PiTextAa,
  PiUploadSimple,
  PiX,
} from 'react-icons/pi';

import DisplaySection from '../../../components/common/ContentDisplay/DisplaySection';
import SubmitButton from '../../../components/common/SubmitButton';
import apiClient from '../../../components/utils/apiClient';
import { useContentActions } from '../../../hooks/useContentActions';
import useResponsive from '../../../hooks/useResponsive';
import { useAuthStore } from '../../../stores/authStore';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { cn } from '../../../utils/cn';

const DocsEditorModal = lazy(() => import('../../../components/common/DocsEditorModal'));
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
  onResultsChange?: (hasResults: boolean) => void;
}

const ScannerTab = ({ onProcessingChange, onResultsChange }: ScannerTabProps) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scannerState, setScannerState] = useState<ScannerState>('upload');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [usePrivateOcr, setUsePrivateOcr] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { isMobileView } = useResponsive(768);

  const locale = useAuthStore((state) => state.locale);
  const partyName = PARTY_NAMES[locale] || PARTY_NAMES['de-DE'];
  const transformPresets = useMemo(() => getTransformPresets(partyName), [partyName]);

  const setGeneratedText = useGeneratedTextStore((state) => state.setGeneratedText);
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  const getContent = useCallback(() => {
    const stored = useGeneratedTextStore.getState().getGeneratedText(COMPONENT_NAME);
    if (typeof stored === 'string') return stored;
    if (stored && typeof stored === 'object' && 'content' in stored)
      return String(stored.content ?? '');
    return result?.text || '';
  }, [result]);
  const getTitle = useCallback(
    () => (selectedFiles.length === 1 ? selectedFiles[0].name.replace(/\.[^.]+$/, '') : 'Scanner'),
    [selectedFiles]
  );
  const {
    handleOpenInDocs,
    handleCreateTodoList,
    handleCreateBoard,
    actionLoading,
    editorModal,
    closeEditorModal,
  } = useContentActions({ getContent, getTitle });

  const handleTransform = useCallback(
    async (instruction: string) => {
      const currentText = useGeneratedTextStore.getState().getGeneratedText(COMPONENT_NAME);
      if (!currentText || typeof currentText !== 'string') return;

      setIsTransforming(true);
      try {
        const response = await apiClient.post('/claude_text_adjustment', {
          originalText: currentText,
          modification: instruction,
          fullText: currentText,
        });

        if (response.data?.suggestions?.[0]) {
          setTextWithHistory(COMPONENT_NAME, response.data.suggestions[0]);
        } else {
          setError('Keine Transformation erhalten.');
        }
      } catch (err: unknown) {
        const error = err as { response?: { data?: { error?: string } }; message?: string };
        setError(error.response?.data?.error || error.message || 'Transformation fehlgeschlagen.');
      } finally {
        setIsTransforming(false);
      }
    },
    [setTextWithHistory]
  );

  useEffect(() => {
    onProcessingChange?.(scannerState === 'processing');
    onResultsChange?.(scannerState === 'success');
  }, [scannerState, onProcessingChange, onResultsChange]);

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

        const url = usePrivateOcr ? '/scanner/extract?provider=docling' : '/scanner/extract';
        const response = await apiClient.post(url, formData, {
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
    <div
      className={cn(
        'mx-auto w-full max-w-[640px] flex-1 content-center px-md py-lg',
        hasResult && 'max-w-[840px]',
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
            className="flex flex-col gap-lg"
          >
            <div className="flex flex-col gap-sm">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
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
              isActive={usePrivateOcr}
              onToggle={setUsePrivateOcr}
              label="Privat verarbeiten"
              icon={PiShieldCheck}
              description="Dokumente werden direkt auf dem Grünerator-Server verarbeitet, ohne Daten an externe Dienste zu senden. Handschriftliche Texte werden in diesem Modus nicht erkannt."
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
            <p className="m-0 text-base text-grey-500">Text wird extrahiert...</p>
          </motion.div>
        )}

        {/* Success State - Results with DisplaySection */}
        {hasResult && (
          <motion.div
            key="results-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex w-full flex-col gap-md"
          >
            <div className="flex items-center gap-sm py-sm">
              {selectedFiles.length > 1 && (
                <>
                  <span className="text-[0.8125rem] font-medium uppercase tracking-[0.04em] text-grey-500">
                    {selectedFiles.length} Dateien
                  </span>
                  <span className="text-xs text-grey-400">·</span>
                </>
              )}
              <span className="text-[0.8125rem] font-medium uppercase tracking-[0.04em] text-grey-500">
                {result.pageCount} Seite{result.pageCount !== 1 ? 'n' : ''}
              </span>
              <span className="text-xs text-grey-400">·</span>
              <span className="text-[0.8125rem] font-medium uppercase tracking-[0.04em] text-grey-500">
                {result.text.length.toLocaleString()} Zeichen
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-start gap-md max-md:grid-cols-1">
              <div className="min-w-0">
                <DisplaySection
                  title={
                    selectedFiles.length === 1
                      ? selectedFiles[0].name
                      : `${selectedFiles.length} Dateien`
                  }
                  value={result.text}
                  componentName={COMPONENT_NAME}
                  useMarkdown={true}
                  showUndoControls={true}
                  showRedoControls={true}
                  showResetButton={true}
                  onReset={handleClearFile}
                  customExportOptions={[
                    {
                      id: 'todo-list',
                      label: 'Aufgabenliste erstellen',
                      icon: <PiCheckSquare size={16} />,
                      onClick: handleCreateTodoList,
                      disabled: !!actionLoading,
                    },
                    {
                      id: 'board',
                      label: 'Board erstellen',
                      icon: <PiKanban size={16} />,
                      onClick: handleCreateBoard,
                      disabled: !!actionLoading,
                    },
                  ]}
                />
              </div>

              <div className="sticky top-md flex flex-col gap-sm max-md:static max-md:flex-row max-md:flex-wrap">
                {transformPresets.map((preset) => (
                  <button
                    key={preset.id}
                    className="flex cursor-pointer items-center gap-sm whitespace-nowrap rounded-md border border-grey-200 bg-background px-md py-sm text-sm text-foreground transition-[border-color,background] duration-200 hover:border-primary hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-grey-700 dark:hover:bg-primary-900"
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
            className="m-0 flex items-center justify-between gap-sm rounded-lg border border-error bg-error/10 px-md py-sm font-medium text-error dark:border-[rgba(211,47,47,0.6)] dark:bg-[rgba(211,47,47,0.15)]"
          >
            <span className="flex-1 leading-[1.4]">{error}</span>
            <button
              type="button"
              className="flex shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-xxs text-error opacity-70 transition-all hover:scale-105 hover:bg-error/10 hover:opacity-100 active:scale-95"
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

      {editorModal && (
        <Suspense fallback={null}>
          <DocsEditorModal
            documentId={editorModal.documentId}
            initialContent={editorModal.initialContent}
            title={editorModal.title}
            onClose={closeEditorModal}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ScannerTab;
