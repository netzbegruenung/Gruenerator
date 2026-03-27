import { ProcessingState } from '@gruenerator/ui';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MdCheck, MdError } from 'react-icons/md';

import apiClient from '../../../components/utils/apiClient';

const POLL_INTERVAL = 2000;
const POLL_INTERVAL_EXTENDED = 5000;
const EXTENDED_POLL_THRESHOLD = 30000;

function mapBackendStage(backendStage: number): number {
  if (backendStage <= 3) return 0;
  return 1;
}

const STEPS = [{ label: 'Untertitel' }, { label: 'Fertigstellung' }];

export interface AutoProcessingResult {
  outputPath: string;
  duration: number;
  uploadId: string;
  projectId: string | null;
  subtitles: string | null;
}

interface AutoProcessingScreenProps {
  uploadId: string;
  onComplete: (result: AutoProcessingResult) => void;
  onError?: (error: string) => void;
}

const AutoProcessingScreen: React.FC<AutoProcessingScreenProps> = ({
  uploadId,
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<'processing' | 'complete' | 'error'>('processing');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const pollProgress = useCallback(async () => {
    if (!uploadId) return;

    try {
      const response = await apiClient.get(`/subtitler/auto-progress/${uploadId}`);
      const data = response.data;

      if (data.status === 'complete') {
        setStatus('complete');
        setActiveStepIndex(1);
        setOverallProgress(100);

        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }

        onComplete({
          outputPath: data.outputPath,
          duration: data.duration,
          uploadId,
          projectId: data.projectId || null,
          subtitles: data.subtitles || null,
        });
        return;
      }

      if (data.status === 'error') {
        setStatus('error');
        setError(data.error || 'Verarbeitung fehlgeschlagen');

        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }

        if (onError) {
          onError(data.error);
        }
        return;
      }

      if (data.stage) setActiveStepIndex(mapBackendStage(data.stage));
      if (data.overallProgress !== undefined) setOverallProgress(data.overallProgress);
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        console.error('[AutoProcessingScreen] Poll error:', err);
      }
    }
  }, [uploadId, onComplete, onError]);

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

    pollProgress().then(() => scheduleNextPoll());

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [uploadId, pollProgress]);

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-md py-xl text-center">
        <motion.div
          className="flex size-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600 dark:bg-red-900/30"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <MdError />
        </motion.div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const stepsWithSuffix = STEPS.map((step, i) =>
    i === 1 && activeStepIndex === 1 ? { ...step, suffix: `${Math.round(overallProgress)}%` } : step
  );

  const label =
    activeStepIndex === 0
      ? 'Untertitel werden generiert...'
      : status === 'complete'
        ? ''
        : 'Wird fertiggestellt...';

  return (
    <>
      <ProcessingState
        progress={overallProgress}
        label={label}
        steps={stepsWithSuffix}
        activeStepIndex={activeStepIndex}
        footer={
          <AnimatePresence>
            {status === 'complete' && (
              <motion.div
                className="flex items-center gap-sm font-medium text-primary-600"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <MdCheck className="text-lg" />
                <span>Fertig!</span>
              </motion.div>
            )}
          </AnimatePresence>
        }
      />
    </>
  );
};

export default AutoProcessingScreen;
