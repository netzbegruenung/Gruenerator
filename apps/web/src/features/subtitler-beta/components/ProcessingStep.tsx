import { getContractsClient } from '@gruenerator/shared/api';
import { Button } from '@gruenerator/ui';
import {
  Check,
  Loader2,
  AlertCircle,
  AudioLines,
  FileText,
  ScanSearch,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useWizardStore } from '../stores/wizardStore';

const POLL_INTERVAL = 2000;
const POLL_INTERVAL_EXTENDED = 5000;
const EXTENDED_POLL_THRESHOLD = 30000;

interface ProcessingStepProps {
  uploadId: string;
  onComplete: (result: {
    projectId: string | null;
    subtitles: string | null;
    uploadId: string;
  }) => void;
}

const STAGES = [
  { label: 'Video analysieren', icon: ScanSearch },
  { label: 'Audio extrahieren', icon: AudioLines },
  { label: 'KI-Transkription', icon: Sparkles },
  { label: 'Untertitel formatieren', icon: FileText },
] as const;

function mapBackendStage(backendStage: number): number {
  // Backend stages 1-4 map to our 0-3
  return Math.max(0, Math.min(3, backendStage - 1));
}

export function ProcessingStep({ uploadId, onComplete }: ProcessingStepProps) {
  const [status, setStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const setProcessingError = useWizardStore((s) => s.setProcessingError);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const startedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Start auto-processing
  useEffect(() => {
    if (!uploadId || startedRef.current) return;
    startedRef.current = true;

    setStatus('processing');
    void getContractsClient()
      .subtitler.postProcessAuto({ body: { uploadId } })
      .catch(() => {
        // auto-process may already be running, polling will pick up the state
      });
  }, [uploadId]);

  const pollProgress = useCallback(async () => {
    if (!uploadId) return;

    try {
      const res = await getContractsClient().subtitler.getAutoProgress({ params: { uploadId } });
      if (res.status !== 200) {
        // 404 = auto job not yet in Redis; keep polling quietly.
        if (res.status !== 404) {
          console.error('[ProcessingStep] Poll error status:', res.status);
        }
        return;
      }
      const data = res.body;

      if (data.status === 'complete') {
        setStatus('complete');
        setActiveStageIndex(3);
        setOverallProgress(100);

        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }

        onCompleteRef.current({
          projectId: data.projectId || null,
          subtitles: data.subtitles || null,
          uploadId,
        });
        return;
      }

      if (data.status === 'error') {
        setStatus('error');
        const msg = data.error || 'Verarbeitung fehlgeschlagen';
        setError(msg);
        setProcessingError(msg);

        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      if (data.stage) setActiveStageIndex(mapBackendStage(data.stage));
      if (data.overallProgress != null) setOverallProgress(data.overallProgress);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        console.error('[ProcessingStep] Poll error:', err);
      }
    }
  }, [uploadId, setProcessingError]);

  useEffect(() => {
    if (!uploadId) return;

    startTimeRef.current = Date.now();
    let cancelled = false;

    function scheduleNextPoll(): void {
      if (cancelled) return;
      const elapsed = Date.now() - startTimeRef.current;
      const interval = elapsed > EXTENDED_POLL_THRESHOLD ? POLL_INTERVAL_EXTENDED : POLL_INTERVAL;
      pollingRef.current = setTimeout(async () => {
        if (cancelled) return;
        await pollProgress();
        scheduleNextPoll();
      }, interval);
    }

    void pollProgress().then(() => scheduleNextPoll());

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [uploadId, pollProgress]);

  const handleRetry = () => {
    startedRef.current = false;
    setStatus('idle');
    setError(null);
    setActiveStageIndex(0);
    setOverallProgress(0);
    setProcessingError(null);
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="mx-auto w-full max-w-[28rem] px-md">
        {/* Stage Checklist */}
        <div className="mb-xl space-y-sm">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const isDone = i < activeStageIndex || status === 'complete';
            const isActive = i === activeStageIndex && status === 'processing';
            const isErrorStage = i === activeStageIndex && status === 'error';

            return (
              <div
                key={stage.label}
                className={`flex items-center gap-md rounded-lg border px-md py-sm transition-all ${
                  isActive
                    ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                    : isDone
                      ? 'border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-900/10'
                      : isErrorStage
                        ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20'
                        : 'border-grey-200 bg-background dark:border-grey-700'
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    isDone
                      ? 'bg-primary-500 text-white'
                      : isActive
                        ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-400'
                        : isErrorStage
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400'
                          : 'bg-grey-100 text-grey-400 dark:bg-grey-800 dark:text-grey-500'
                  }`}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isErrorStage ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isDone
                      ? 'text-primary-700 dark:text-primary-300'
                      : isActive
                        ? 'text-primary-700 dark:text-primary-300'
                        : isErrorStage
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-grey-400 dark:text-grey-500'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        {status === 'processing' && (
          <div>
            <div className="flex justify-between text-xs text-grey-500">
              <span>Fortschritt</span>
              <span>{overallProgress}%</span>
            </div>
            <div className="mt-xs h-1.5 overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
              <div
                className="h-full rounded-full bg-primary-500 transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="text-center">
            <p className="mb-md text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" onClick={handleRetry}>
              Erneut versuchen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
