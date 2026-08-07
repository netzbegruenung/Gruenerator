import { MAX_AUDIO_BYTES, MAX_AUDIO_MB, MAX_AUDIO_MINUTES } from '@gruenerator/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FeatureToggle,
  FileCard,
  ProcessingState,
  Ripple,
  StepBreadcrumb,
  toast,
} from '@gruenerator/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiDocumentText, HiDownload } from 'react-icons/hi';
import { IoCopyOutline } from 'react-icons/io5';
import { PiCheckSquare, PiKanban, PiMicrophone, PiNotePencil, PiUsersThree } from 'react-icons/pi';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import SubmitButton from '../../components/common/SubmitButton';
import ErrorBoundary from '../../components/ErrorBoundary';
import { copyFormattedContent } from '../../components/utils/commonFunctions';
import { useContentActions } from '../../hooks/useContentActions';
import { useExportStore } from '../../stores/core/exportStore';
import { downloadFile } from '../../utils/downloadFile';

import AudioVisualizer from './components/AudioVisualizer';
import TranscriptionResult from './components/TranscriptionResult';
import UploadZone from './components/UploadZone';
import { formatElapsed, useElapsedTime } from './hooks/useElapsedTime';
import { useProtokoll } from './hooks/useProtokoll';
import { useTranscription } from './hooks/useTranscription';
import { useLastTranscriptionStore } from './stores/lastTranscriptionStore';
import { transcriptToMarkdown } from './utils/formatTranscript';
import { readMediaDurationSeconds } from './utils/mediaDuration';

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
  const { state, transcribe, reset, restore } = useTranscription();
  const {
    state: protokollState,
    formatAsProtokoll,
    reset: resetProtokoll,
    restore: restoreProtokoll,
  } = useProtokoll();
  const [options, setOptions] = useState<TranscriptionOptions>({
    diarize: false,
    timestamps: true,
    language: 'de',
    privacyMode: true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedProtokollTyp, setSelectedProtokollTyp] = useState<ProtokollTyp | null>(null);
  // Which of the two results is on screen. Switching used to *discard* the
  // Protokoll, so going back cost a second AI round-trip and every export
  // silently reverted to the transcript.
  const [showOriginal, setShowOriginal] = useState(false);
  const [durationWarning, setDurationWarning] = useState<string | null>(null);
  // User corrections to the AI-detected speaker names, layered over speakerMap.
  // Purely client-side: getSpeakerLabel already takes a map, so this needs no
  // endpoint and no schema — and it rides along on the persist store below.
  const [speakerOverrides, setSpeakerOverrides] = useState<Record<string, string>>({});
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const isVideo = selectedFile?.type.startsWith('video/') ?? false;

  const { last: lastTranscription, save: saveLast, patch: patchLast } = useLastTranscriptionStore();

  const generateDOCX = useExportStore((s) => s.generateDOCX);
  const generatePDF = useExportStore((s) => s.generatePDF);
  const isExporting = useExportStore((s) => s.isGenerating);

  const hasProtokoll = protokollState.status === 'done' && !!protokollState.result;
  const isProtokollView = hasProtokoll && !showOriginal;

  const effectiveSpeakerMap = useMemo(
    () => ({ ...state.speakerMap, ...speakerOverrides }),
    [state.speakerMap, speakerOverrides]
  );

  // Protokoll result is already Markdown; a raw transcript gets its `[speaker_N]`
  // markers resolved to labelled Markdown so copy/download/docs/todo/board all
  // format cleanly. Everything that exports goes through here, so the toggle
  // above is what decides which of the two leaves the page.
  const getActiveContent = useCallback(
    () =>
      isProtokollView
        ? protokollState.result
        : transcriptToMarkdown(state.text, effectiveSpeakerMap),
    [isProtokollView, protokollState.result, state.text, effectiveSpeakerMap]
  );
  const getTitle = useCallback(() => {
    const base = selectedFile?.name.replace(/\.[^.]+$/, '') ?? 'Transkription';
    return isProtokollView && protokollState.typ ? `${protokollState.typ} — ${base}` : base;
  }, [selectedFile, isProtokollView, protokollState.typ]);
  const getDocumentType = useCallback(
    () => (isProtokollView ? ('protokoll' as const) : ('notizen' as const)),
    [isProtokollView]
  );

  const { handleOpenInDocs, handleCreateTodoList, handleCreateBoard, actionLoading } =
    useContentActions({ getContent: getActiveContent, getTitle, getDocumentType });

  // Informational only — anything over MAX_AUDIO_MINUTES is auto-split into
  // chunks server-side (transcribeBuffer in transcriptionRouterService.ts) and
  // merged back into one transcript, so this no longer blocks submission.
  const handleFileSelected = useCallback((file: File) => {
    // UploadZone's dropzone-level maxSizeMB is MAX_VIDEO_UPLOAD_MB (3GB) so
    // large videos aren't blocked before this runs — but a non-video file that
    // large would still fail server-side (MAX_AUDIO_BYTES, enforced in
    // voiceContractRouter.ts/voiceController.ts). Catch it here instead of
    // after a multi-GB upload completes.
    if (!file.type.startsWith('video/') && file.size > MAX_AUDIO_BYTES) {
      toast.error(`Datei ist zu groß. Maximal ${MAX_AUDIO_MB}MB für Audio-Dateien.`);
      return;
    }
    setSelectedFile(file);
    setDurationWarning(null);
    void readMediaDurationSeconds(file).then((seconds) => {
      if (seconds != null && seconds > MAX_AUDIO_MINUTES * 60) {
        const chunks = Math.ceil(seconds / (MAX_AUDIO_MINUTES * 60));
        setDurationWarning(
          `Die Aufnahme ist ${Math.round(seconds / 60)} Minuten lang und wird automatisch in ${chunks} Abschnitte à höchstens ${MAX_AUDIO_MINUTES} Minuten aufgeteilt. Das dauert entsprechend länger.`
        );
      }
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedFile) return;
    const text = await transcribe(selectedFile, options);
    // `text.trim()` rather than `text`: an empty-but-present transcript would
    // otherwise spend an AI call producing a Protokoll of nothing.
    if (text?.trim() && selectedProtokollTyp) {
      void formatAsProtokoll(text, selectedProtokollTyp);
    }
  }, [selectedFile, transcribe, options, selectedProtokollTyp, formatAsProtokoll]);

  // Persist whenever a finished result changes, so a reload or a crash is no
  // longer fatal. One slot, not a list — the durable archive is Docs.
  useEffect(() => {
    if (state.status !== 'done' || !state.text) return;
    saveLast({
      text: state.text,
      segments: state.segments,
      hasTimestamps: state.hasTimestamps,
      speakerMap: state.speakerMap,
      speakerOverrides,
      fileName: selectedFile?.name ?? '',
      protokoll: protokollState.status === 'done' ? protokollState.result : '',
      protokollTyp: protokollState.status === 'done' ? protokollState.typ : null,
      savedAt: new Date().toISOString(),
    });
  }, [
    state.status,
    state.text,
    state.segments,
    state.hasTimestamps,
    state.speakerMap,
    speakerOverrides,
    selectedFile,
    protokollState.status,
    protokollState.result,
    protokollState.typ,
    saveLast,
  ]);

  const handleRecoverLast = useCallback(() => {
    if (!lastTranscription) return;
    restore({
      text: lastTranscription.text,
      segments: lastTranscription.segments,
      hasTimestamps: lastTranscription.hasTimestamps,
      speakerMap: lastTranscription.speakerMap,
    });
    setSpeakerOverrides(lastTranscription.speakerOverrides ?? {});
    if (lastTranscription.protokoll && lastTranscription.protokollTyp) {
      restoreProtokoll(lastTranscription.protokoll, lastTranscription.protokollTyp);
    }
    setRecoveryDismissed(true);
  }, [lastTranscription, restore, restoreProtokoll]);

  const handleRenameSpeaker = useCallback(
    (speakerId: string, currentLabel: string) => {
      const next = window.prompt('Name der sprechenden Person', currentLabel);
      if (next == null) return;
      const trimmed = next.trim();
      setSpeakerOverrides((prev) => {
        // An emptied field means "drop my correction", not "blank name".
        if (!trimmed) {
          const { [speakerId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [speakerId]: trimmed };
      });
      patchLast({ speakerOverrides: { ...speakerOverrides, [speakerId]: trimmed } });
    },
    [patchLast, speakerOverrides]
  );

  const handleCopy = useCallback(async () => {
    await copyFormattedContent(getActiveContent(), () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [getActiveContent]);

  // All text downloads follow the Protokoll/Original toggle. They used to read
  // `state.text` unconditionally, so downloading a Protokoll handed you the raw
  // transcript — complete with unresolved [speaker_N] markers.
  const handleDownloadMd = useCallback(() => {
    downloadFile(getActiveContent(), `${getTitle()}.md`, 'text/markdown');
  }, [getActiveContent, getTitle]);

  const handleDownloadTxt = useCallback(() => {
    downloadFile(getActiveContent(), `${getTitle()}.txt`, 'text/plain');
  }, [getActiveContent, getTitle]);

  // .srt is the one export that ignores the toggle: subtitles are timecoded
  // segments, and a Protokoll has no timecodes. It is hidden in Protokoll view.
  const handleDownloadSrt = useCallback(() => {
    const srt = state.segments
      .map(
        (seg, i) =>
          `${i + 1}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${seg.text.trim()}\n`
      )
      .join('\n');
    downloadFile(srt, `${getTitle()}.srt`, 'text/srt');
  }, [state.segments, getTitle]);

  // Both server-side generators accept Markdown directly (contentParser detects
  // it), so the Protokoll needs no conversion on the way out.
  const handleDownloadDocx = useCallback(async () => {
    const pending = toast.loading('Word-Datei wird erstellt …');
    try {
      await generateDOCX(getActiveContent(), getTitle());
      toast.success('Word-Datei erstellt', { id: pending });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Word-Export fehlgeschlagen', {
        id: pending,
      });
    }
  }, [generateDOCX, getActiveContent, getTitle]);

  const handleDownloadPdf = useCallback(async () => {
    const pending = toast.loading('PDF wird erstellt …');
    try {
      await generatePDF(getActiveContent(), getTitle());
      toast.success('PDF erstellt', { id: pending });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'PDF-Export fehlgeschlagen', {
        id: pending,
      });
    }
  }, [generatePDF, getActiveContent, getTitle]);

  const handleFormatProtokoll = useCallback(
    (typ: ProtokollTyp) => {
      setShowOriginal(false);
      void formatAsProtokoll(state.text, typ);
    },
    [formatAsProtokoll, state.text]
  );

  const handleReset = useCallback(() => {
    reset();
    resetProtokoll();
    setSelectedFile(null);
    setCopied(false);
    setSelectedProtokollTyp(null);
    setShowOriginal(false);
    setDurationWarning(null);
  }, [reset, resetProtokoll]);

  // Retry keeps the picked file: a full reset means re-uploading a file that may
  // have taken minutes, which is the last thing you want after a failure.
  const handleRetry = useCallback(() => {
    reset();
    resetProtokoll();
    setCopied(false);
    setShowOriginal(false);
  }, [reset, resetProtokoll]);

  // `reset()` aborts the in-flight request via the hook's AbortController — that
  // has always worked, it was simply never offered while a job was running, so
  // closing the tab was the only way out.
  const handleCancel = handleRetry;

  const isBusy =
    state.status === 'uploading' ||
    state.status === 'extracting' ||
    state.status === 'transcribing';
  const elapsed = useElapsedTime(isBusy);

  const cancelButton = (
    <button
      type="button"
      onClick={handleCancel}
      className="px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
    >
      Abbrechen
    </button>
  );

  const showRipple = state.status === 'idle' && !selectedFile;
  const canRecover = !!lastTranscription?.text && !recoveryDismissed;
  const [isHovering, setIsHovering] = useState(false);

  return (
    <ErrorBoundary>
      <PageContainer
        title="Transkription"
        subtitle="Audio- und Meeting-Aufnahmen automatisch transkribieren."
        maxWidth="md"
      >
        {showRipple && canRecover && (
          <div className="mb-lg rounded-lg border border-grey-300 dark:border-grey-600 bg-background-pure p-md flex flex-wrap items-center justify-between gap-md">
            <p className="text-sm text-foreground m-0">
              Letzte Transkription
              {lastTranscription?.fileName ? ` (${lastTranscription.fileName})` : ''} ist noch
              gespeichert.
            </p>
            <div className="flex items-center gap-sm">
              <button
                type="button"
                onClick={handleRecoverLast}
                className="px-md py-sm text-sm rounded-md bg-primary-600 text-white hover:bg-primary-500 transition-colors cursor-pointer border-none"
              >
                Wiederherstellen
              </button>
              <button
                type="button"
                onClick={() => setRecoveryDismissed(true)}
                className="px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
              >
                Verwerfen
              </button>
            </div>
          </div>
        )}

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
              isActive={options.diarize}
              onToggle={(v) => setOptions((o) => ({ ...o, diarize: v, privacyMode: !v }))}
              label="Sprecher*innen erkennen"
              icon={PiUsersThree}
              description="Erkennt verschiedene Sprecher*innen im Audio — ideal für Podcasts oder Interviews. Dabei werden die Daten an einen externen Dienst (Mistral) gesendet. Für Protokolle und Einzelaufnahmen ist dies nicht nötig."
              noBorder
            />

            <div className="flex flex-wrap items-center gap-md">
              <select
                value={options.language}
                aria-label="Sprache der Aufnahme"
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

            {durationWarning && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-md">
                <p className="text-sm text-amber-800 dark:text-amber-300 m-0">{durationWarning}</p>
              </div>
            )}

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
          // ProcessingState renders plain markup, so the live region wraps it —
          // otherwise a screen reader is told nothing at all while a long upload
          // and extraction run.
          <div role="status" aria-live="polite">
            <ProcessingState
              progress={state.progress}
              label={
                state.status === 'uploading'
                  ? isVideo
                    ? 'Video wird hochgeladen'
                    : 'Wird hochgeladen'
                  : 'Audio wird extrahiert'
              }
              steps={
                isVideo
                  ? [{ label: 'Hochladen' }, { label: 'Extrahieren' }, { label: 'Transkribieren' }]
                  : [{ label: 'Hochladen' }, { label: 'Transkribieren' }]
              }
              activeStepIndex={state.status === 'uploading' ? 0 : 1}
              footer={cancelButton}
            />
          </div>
        )}

        {/*
          No live transcript here on purpose. `timestamps` is always requested,
          which makes the backend take its single-shot branch, so `text.delta`
          never fires and a streaming view would render an empty box forever.
          An elapsed clock is what can be shown honestly.
        */}
        {state.status === 'transcribing' && (
          <div className="flex flex-col items-center gap-lg py-xl" role="status" aria-live="polite">
            <AudioVisualizer className="h-12" />
            <div className="flex flex-col items-center gap-xs">
              <p className="text-sm font-medium text-foreground">
                Wird transkribiert… {formatElapsed(elapsed)}
              </p>
              <StepBreadcrumb
                steps={
                  isVideo
                    ? [
                        { label: 'Hochladen' },
                        { label: 'Extrahieren' },
                        { label: 'Transkribieren' },
                      ]
                    : [{ label: 'Hochladen' }, { label: 'Transkribieren' }]
                }
                activeIndex={isVideo ? 2 : 1}
              />
              <p className="text-xs text-grey-500 dark:text-grey-400">
                Lange Aufnahmen brauchen mehrere Minuten.
              </p>
              {options.privacyMode && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  (Datenschutz-Modus — kann länger dauern)
                </p>
              )}
            </div>
            {cancelButton}
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
                speakerMap={effectiveSpeakerMap}
                formattedText={isProtokollView ? protokollState.result : undefined}
                onRenameSpeaker={isProtokollView ? undefined : handleRenameSpeaker}
              />
            )}

            <div className="flex flex-wrap items-center gap-sm">
              {hasProtokoll && (
                <div
                  role="group"
                  aria-label="Ansicht"
                  className="flex items-center rounded-md border border-grey-300 dark:border-grey-600 overflow-hidden"
                >
                  <button
                    type="button"
                    aria-pressed={isProtokollView}
                    onClick={() => setShowOriginal(false)}
                    className={cn(
                      'px-md py-sm text-sm transition-colors cursor-pointer border-none',
                      isProtokollView
                        ? 'bg-primary-600 text-white'
                        : 'bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800'
                    )}
                  >
                    {protokollState.typ ?? 'Protokoll'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={!isProtokollView}
                    onClick={() => setShowOriginal(true)}
                    className={cn(
                      'px-md py-sm text-sm transition-colors cursor-pointer border-none',
                      !isProtokollView
                        ? 'bg-primary-600 text-white'
                        : 'bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800'
                    )}
                  >
                    Originaltext
                  </button>
                </div>
              )}

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
                    disabled={isExporting}
                    className={cn(
                      'flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer',
                      isExporting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <HiDownload size={16} />
                    Herunterladen
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleDownloadDocx}>Als Word (.docx)</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownloadPdf}>Als PDF (.pdf)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDownloadMd}>Als Markdown (.md)</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownloadTxt}>Als Text (.txt)</DropdownMenuItem>
                  {!isProtokollView && state.hasTimestamps && state.segments.length > 0 && (
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

              {/*
                Promoted out of the "Weiterverarbeiten" dropdown: this is the
                only action that gives a transcript a durable home (a
                collaborative_document, and with it history, search and
                sharing), and it was buried two levels deep.
              */}
              <button
                type="button"
                onClick={handleOpenInDocs}
                disabled={!!actionLoading}
                className={cn(
                  'flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer',
                  actionLoading === 'docs' && 'opacity-50 cursor-not-allowed'
                )}
              >
                <PiNotePencil size={16} />
                {actionLoading === 'docs' ? 'Wird gespeichert…' : 'Als Dokument speichern'}
              </button>

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
                    <PiCheckSquare size={16} />
                    {actionLoading && actionLoading !== 'docs'
                      ? 'Wird erstellt…'
                      : 'Weiterverarbeiten'}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
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
            <div className="flex flex-wrap items-center justify-center gap-sm">
              <button
                type="button"
                onClick={handleRetry}
                className="px-md py-sm text-sm rounded-md bg-primary-600 text-white hover:bg-primary-500 transition-colors cursor-pointer border-none"
              >
                Erneut versuchen
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
              >
                Andere Datei wählen
              </button>
            </div>
          </div>
        )}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(TranskriptionPage, {
  title: 'Transkription',
});
