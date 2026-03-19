import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FeatureToggle,
  FileCard,
  Ripple,
} from '@gruenerator/ui';
import { lazy, Suspense, useCallback, useState } from 'react';
import { HiDocumentText, HiDownload } from 'react-icons/hi';
import { IoCopyOutline } from 'react-icons/io5';
import { PiCheckSquare, PiKanban, PiMicrophone, PiNotePencil, PiShieldCheck } from 'react-icons/pi';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import SubmitButton from '../../components/common/SubmitButton';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useContentActions } from '../../hooks/useContentActions';
import { downloadFile } from '../../utils/downloadFile';

const DocsEditorModal = lazy(() => import('../../components/common/DocsEditorModal'));

import TranscriptionResult from './components/TranscriptionResult';
import UploadZone from './components/UploadZone';
import { useProtokoll } from './hooks/useProtokoll';
import { useTranscription } from './hooks/useTranscription';

import type { ProtokollTyp } from './hooks/useProtokoll';
import type { TranscriptionOptions } from './hooks/useTranscription';

import { cn } from '@/utils/cn';

const LANGUAGES = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'ru', label: 'Русский' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'ar', label: 'العربية' },
  { value: 'hi', label: 'हिन्दी' },
];

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

const PROTOKOLL_TYPES: { value: ProtokollTyp; label: string; description: string }[] = [
  {
    value: 'Sitzungsprotokoll',
    label: 'Sitzungsprotokoll',
    description: 'Diskussion + Beschlüsse',
  },
  {
    value: 'Ergebnisprotokoll',
    label: 'Ergebnisprotokoll',
    description: 'Nur Beschlüsse + Aufgaben',
  },
  {
    value: 'Verlaufsprotokoll',
    label: 'Verlaufsprotokoll',
    description: 'Chronologischer Verlauf',
  },
];

const TranskriptionPage = () => {
  const { state, transcribe, reset } = useTranscription();
  const { state: protokollState, formatAsProtokoll, reset: resetProtokoll } = useProtokoll();
  const [options, setOptions] = useState<TranscriptionOptions>({
    diarize: true,
    timestamps: true,
    language: 'de',
    privacyMode: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedProtokollTyp, setSelectedProtokollTyp] = useState<ProtokollTyp | null>(null);
  const isVideo = selectedFile?.type.startsWith('video/') ?? false;

  const getActiveContent = useCallback(
    () => protokollState.result || state.text,
    [protokollState.result, state.text]
  );
  const getTitle = useCallback(
    () => selectedFile?.name.replace(/\.[^.]+$/, '') ?? 'Transkription',
    [selectedFile]
  );

  const {
    handleOpenInDocs,
    handleCreateTodoList,
    handleCreateBoard,
    actionLoading,
    editorModal,
    closeEditorModal,
  } = useContentActions({ getContent: getActiveContent, getTitle });

  const handleFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedFile) return;
    const text = await transcribe(selectedFile, options);
    if (text && selectedProtokollTyp) {
      formatAsProtokoll(text, selectedProtokollTyp);
    }
  }, [selectedFile, transcribe, options, selectedProtokollTyp, formatAsProtokoll]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getActiveContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getActiveContent]);

  const handleDownloadTxt = useCallback(() => {
    downloadFile(state.text, `${getTitle()}.txt`, 'text/plain');
  }, [state.text, getTitle]);

  const handleDownloadSrt = useCallback(() => {
    const srt = state.segments
      .map(
        (seg, i) =>
          `${i + 1}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${seg.text.trim()}\n`
      )
      .join('\n');
    downloadFile(srt, `${getTitle()}.srt`, 'text/srt');
  }, [state.segments, getTitle]);

  const handleFormatProtokoll = useCallback(
    (typ: ProtokollTyp) => {
      formatAsProtokoll(state.text, typ);
    },
    [formatAsProtokoll, state.text]
  );

  const handleReset = useCallback(() => {
    reset();
    resetProtokoll();
    setSelectedFile(null);
    setCopied(false);
    setSelectedProtokollTyp(null);
  }, [reset, resetProtokoll]);

  const showRipple = state.status === 'idle' && !selectedFile;
  const [isHovering, setIsHovering] = useState(false);

  return (
    <ErrorBoundary>
      <PageContainer
        title="Transkription"
        subtitle="Audio- und Meeting-Aufnahmen automatisch transkribieren."
        maxWidth="md"
      >
        {showRipple && (
          <div className="relative">
            <div
              className={cn(
                'absolute inset-0 -inset-x-[50vw] -inset-y-[50vh] overflow-hidden pointer-events-none transition-all duration-300',
                isHovering &&
                  '[&_.animate-ripple]:!border-secondary-600/30 [&_.animate-ripple]:!bg-secondary-600/10 [&_.animate-ripple]:![animation-duration:0.8s]'
              )}
            >
              <Ripple mainCircleSize={200} mainCircleOpacity={0.08} numCircles={10} />
            </div>
            <UploadZone onFileSelected={handleFileSelected} onHoverChange={setIsHovering} />
          </div>
        )}

        {state.status === 'idle' && selectedFile && (
          <div className="flex flex-col gap-lg">
            <FileCard
              name={selectedFile.name}
              size={selectedFile.size}
              icon={<PiMicrophone size={20} />}
              onRemove={() => setSelectedFile(null)}
            />

            <FeatureToggle
              isActive={options.privacyMode ?? false}
              onToggle={(v) => setOptions((o) => ({ ...o, privacyMode: v }))}
              label="Privat verarbeiten"
              icon={PiShieldCheck}
              description="Audio wird ausschließlich auf unseren eigenen Servern verarbeitet, ohne Daten an externe Dienste zu senden."
              noBorder
            />

            <div className="flex flex-wrap items-center gap-md">
              <select
                value={options.language}
                onChange={(e) => setOptions((o) => ({ ...o, language: e.target.value }))}
                className="px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground cursor-pointer"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-xs px-md py-sm text-sm rounded-md border transition-colors cursor-pointer select-none',
                      selectedProtokollTyp
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-background text-foreground border-grey-300 dark:border-grey-600 hover:border-primary-400'
                    )}
                  >
                    <HiDocumentText size={16} />
                    {selectedProtokollTyp
                      ? PROTOKOLL_TYPES.find((t) => t.value === selectedProtokollTyp)?.label
                      : 'Protokoll erstellen'}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {selectedProtokollTyp && (
                    <DropdownMenuItem onClick={() => setSelectedProtokollTyp(null)}>
                      <div className="text-grey-500">Kein Protokoll</div>
                    </DropdownMenuItem>
                  )}
                  {PROTOKOLL_TYPES.map((typ) => (
                    <DropdownMenuItem
                      key={typ.value}
                      onClick={() => setSelectedProtokollTyp(typ.value)}
                    >
                      <div>
                        <div
                          className={cn(
                            'font-medium',
                            selectedProtokollTyp === typ.value && 'text-primary-600'
                          )}
                        >
                          {typ.label}
                        </div>
                        <div className="text-xs text-grey-500 dark:text-grey-400">
                          {typ.description}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <SubmitButton
              text="Transkribieren"
              loading={false}
              icon={<PiMicrophone />}
              onClick={handleStart}
              className="w-full"
              type="button"
            />
          </div>
        )}

        {(state.status === 'uploading' || state.status === 'extracting') && (
          <div className="flex flex-col items-center gap-md py-xl">
            <div className="flex items-center gap-sm text-xs text-grey-400 dark:text-grey-500 mb-sm">
              <span
                className={
                  state.status === 'uploading'
                    ? 'text-primary-600 font-semibold'
                    : 'text-primary-600'
                }
              >
                Hochladen
              </span>
              <span>→</span>
              {isVideo && (
                <>
                  <span
                    className={
                      state.status === 'extracting' ? 'text-primary-600 font-semibold' : ''
                    }
                  >
                    Audio extrahieren
                  </span>
                  <span>→</span>
                </>
              )}
              <span>Transkribieren</span>
            </div>

            <div className="w-full max-w-[20rem] h-2 bg-grey-200 dark:bg-grey-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <p className="text-sm text-grey-500 dark:text-grey-400">
              {state.status === 'uploading' && (
                <>
                  {isVideo ? 'Video wird hochgeladen' : 'Hochladen'}... {state.progress}%
                </>
              )}
              {state.status === 'extracting' && (
                <>Audio wird extrahiert... {state.progress > 0 ? `${state.progress}%` : ''}</>
              )}
            </p>
          </div>
        )}

        {state.status === 'transcribing' && (
          <div className="flex flex-col gap-md">
            {state.text ? (
              <TranscriptionResult
                text={state.text}
                segments={state.segments}
                hasTimestamps={state.hasTimestamps}
                speakerMap={state.speakerMap}
                isStreaming
              />
            ) : (
              <div className="flex flex-col items-center gap-md py-xl">
                <div className="flex items-center gap-sm text-xs text-grey-400 dark:text-grey-500 mb-sm">
                  <span className="text-primary-600">Hochladen</span>
                  <span>→</span>
                  {isVideo && (
                    <>
                      <span className="text-primary-600">Audio extrahieren</span>
                      <span>→</span>
                    </>
                  )}
                  <span className="text-primary-600 font-semibold">Transkribieren</span>
                </div>
                <div className="size-8 animate-spin rounded-full border-3 border-grey-200 border-t-primary-500" />
                <p className="text-sm text-grey-500 dark:text-grey-400">Wird transkribiert...</p>
                {options.privacyMode && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    (Datenschutz-Modus — kann länger dauern)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {state.status === 'done' && (
          <div className="flex flex-col gap-lg">
            {protokollState.status === 'generating' && (
              <div className="flex flex-col items-center gap-md py-xl">
                <div className="size-8 animate-spin rounded-full border-3 border-grey-200 border-t-primary-500" />
                <p className="text-sm text-grey-500 dark:text-grey-400">
                  Protokoll wird erstellt...
                </p>
              </div>
            )}

            {protokollState.status === 'error' && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-md">
                <p className="text-sm text-red-600 dark:text-red-400">{protokollState.error}</p>
              </div>
            )}

            {protokollState.status !== 'generating' && (
              <TranscriptionResult
                text={state.text}
                segments={state.segments}
                hasTimestamps={state.hasTimestamps}
                speakerMap={state.speakerMap}
                formattedText={protokollState.status === 'done' ? protokollState.result : undefined}
                onShowOriginal={protokollState.status === 'done' ? resetProtokoll : undefined}
              />
            )}

            <div className="flex flex-wrap items-center gap-sm">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
              >
                <IoCopyOutline size={16} />
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
                  >
                    <HiDownload size={16} />
                    Herunterladen
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleDownloadTxt}>Als Text (.txt)</DropdownMenuItem>
                  {state.hasTimestamps && state.segments.length > 0 && (
                    <DropdownMenuItem onClick={handleDownloadSrt}>
                      Als Untertitel (.srt)
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={protokollState.status === 'generating'}
                    className={cn(
                      'flex items-center gap-xs px-md py-sm text-sm rounded-md border transition-colors cursor-pointer',
                      protokollState.status === 'done'
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800',
                      protokollState.status === 'generating' && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <HiDocumentText size={16} />
                    Protokoll
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {PROTOKOLL_TYPES.map((typ) => (
                    <DropdownMenuItem
                      key={typ.value}
                      onClick={() => handleFormatProtokoll(typ.value)}
                    >
                      <div>
                        <div className="font-medium">{typ.label}</div>
                        <div className="text-xs text-grey-500 dark:text-grey-400">
                          {typ.description}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!!actionLoading}
                    className={cn(
                      'flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer',
                      actionLoading && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <PiNotePencil size={16} />
                    {actionLoading ? 'Wird erstellt...' : 'Weiterverarbeiten'}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleOpenInDocs} disabled={!!actionLoading}>
                    <PiNotePencil size={16} className="mr-xs" />
                    In Docs öffnen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCreateTodoList} disabled={!!actionLoading}>
                    <PiCheckSquare size={16} className="mr-xs" />
                    Aufgabenliste erstellen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleCreateBoard} disabled={!!actionLoading}>
                    <PiKanban size={16} className="mr-xs" />
                    Board erstellen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={handleReset}
                className="ml-auto px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
              >
                Neue Transkription
              </button>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center gap-md py-xl text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
            <button
              type="button"
              onClick={handleReset}
              className="px-md py-sm text-sm rounded-md bg-primary-600 text-white hover:bg-primary-500 transition-colors cursor-pointer border-none"
            >
              Erneut versuchen
            </button>
          </div>
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
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(TranskriptionPage, {
  title: 'Transkription',
});
