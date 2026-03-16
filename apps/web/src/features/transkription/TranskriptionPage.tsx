import { useCallback, useState } from 'react';
import { HiDownload, HiShieldCheck } from 'react-icons/hi';
import { IoCopyOutline } from 'react-icons/io5';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';

import TranscriptionResult from './components/TranscriptionResult';
import UploadZone from './components/UploadZone';
import { useTranscription } from './hooks/useTranscription';

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

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const toggleClass = (active?: boolean) =>
  cn(
    'px-md py-sm text-sm rounded-md border transition-colors cursor-pointer select-none',
    active
      ? 'bg-primary-600 text-white border-primary-600'
      : 'bg-background text-foreground border-grey-300 dark:border-grey-600 hover:border-primary-400'
  );

const TranskriptionPage = () => {
  const { state, transcribe, reset } = useTranscription();
  const [options, setOptions] = useState<TranscriptionOptions>({
    diarize: false,
    timestamps: false,
    language: 'de',
    privacyMode: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileSelected = useCallback(
    (file: File) => {
      setSelectedFile(file);
      transcribe(file, options);
    },
    [transcribe, options]
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(state.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [state.text]);

  const handleDownloadTxt = useCallback(() => {
    const name = selectedFile?.name.replace(/\.[^.]+$/, '') ?? 'transkription';
    downloadFile(state.text, `${name}.txt`, 'text/plain');
  }, [state.text, selectedFile]);

  const handleDownloadSrt = useCallback(() => {
    const srt = state.segments
      .map(
        (seg, i) =>
          `${i + 1}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${seg.text.trim()}\n`
      )
      .join('\n');
    const name = selectedFile?.name.replace(/\.[^.]+$/, '') ?? 'transkription';
    downloadFile(srt, `${name}.srt`, 'text/srt');
  }, [state.segments, selectedFile]);

  const handleReset = useCallback(() => {
    reset();
    setSelectedFile(null);
    setCopied(false);
  }, [reset]);

  return (
    <ErrorBoundary>
      <PageContainer
        title="Transkription"
        subtitle="Audio- und Meeting-Aufnahmen automatisch transkribieren."
        maxWidth="md"
      >
        {state.status === 'idle' && (
          <div className="flex flex-col gap-lg">
            <div className="flex flex-wrap items-center gap-md">
              <button
                type="button"
                className={cn(
                  toggleClass(options.privacyMode),
                  options.privacyMode && 'bg-emerald-700 border-emerald-700'
                )}
                onClick={() =>
                  setOptions((o) => ({
                    ...o,
                    privacyMode: !o.privacyMode,
                    ...(!o.privacyMode && { diarize: false }),
                  }))
                }
              >
                <span className="flex items-center gap-xs">
                  <HiShieldCheck size={16} />
                  Datenschutz-Modus
                </span>
              </button>
              <button
                type="button"
                className={cn(
                  toggleClass(options.diarize),
                  options.privacyMode && 'opacity-50 cursor-not-allowed'
                )}
                disabled={options.privacyMode}
                title={options.privacyMode ? 'Nicht verfügbar im Datenschutz-Modus' : undefined}
                onClick={() => setOptions((o) => ({ ...o, diarize: !o.diarize }))}
              >
                Sprecher*innen erkennen
              </button>
              <button
                type="button"
                className={toggleClass(options.timestamps)}
                onClick={() => setOptions((o) => ({ ...o, timestamps: !o.timestamps }))}
              >
                Zeitstempel
              </button>
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
            </div>

            {options.privacyMode && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                <HiShieldCheck className="inline mr-xs" size={14} />
                Im Datenschutz-Modus wird die Audio-Datei ausschließlich auf unseren eigenen Servern
                verarbeitet.
              </p>
            )}

            <UploadZone onFileSelected={handleFileSelected} />
          </div>
        )}

        {state.status === 'uploading' && (
          <div className="flex flex-col items-center gap-md py-xl">
            <div className="w-full max-w-[20rem] h-2 bg-grey-200 dark:bg-grey-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <p className="text-sm text-grey-500 dark:text-grey-400">
              Hochladen... {state.progress}%
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
                isStreaming
              />
            ) : (
              <div className="flex flex-col items-center gap-md py-xl">
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
            <TranscriptionResult
              text={state.text}
              segments={state.segments}
              hasTimestamps={state.hasTimestamps}
            />

            <div className="flex flex-wrap items-center gap-sm">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
              >
                <IoCopyOutline size={16} />
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
              >
                <HiDownload size={16} />
                Als Text
              </button>
              {state.hasTimestamps && state.segments.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadSrt}
                  className="flex items-center gap-xs px-md py-sm text-sm rounded-md border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer"
                >
                  <HiDownload size={16} />
                  Als SRT
                </button>
              )}
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
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(TranskriptionPage, {
  title: 'Transkription',
});
