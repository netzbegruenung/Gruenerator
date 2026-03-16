import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MdSearch, MdContentCut, MdSubtitles, MdCheck, MdError } from 'react-icons/md';

import { cn } from '@/utils/cn';

import apiClient from '../../../components/utils/apiClient';

import type { IconType } from 'react-icons';

interface Stage {
  id: number;
  name: string;
  Icon: IconType;
}

const STAGES: Stage[] = [
  { id: 1, name: 'Video wird analysiert...', Icon: MdSearch },
  { id: 2, name: 'Stille Teile werden entfernt...', Icon: MdContentCut },
  { id: 3, name: 'Untertitel werden generiert...', Icon: MdSubtitles },
  { id: 4, name: 'Wird fertiggestellt...', Icon: MdCheck },
];

const POLL_INTERVAL = 2000;
const POLL_INTERVAL_EXTENDED = 5000;
const EXTENDED_POLL_THRESHOLD = 30000;

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
  const [currentStage, setCurrentStage] = useState<number>(1);
  const [stageProgress, setStageProgress] = useState<number>(0);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const pollProgress = useCallback(async () => {
    if (!uploadId) return;

    try {
      const response = await apiClient.get(`/subtitler/auto-progress/${uploadId}`);
      const data = response.data;

      if (data.status === 'complete') {
        setStatus('complete');
        setCurrentStage(4);
        setStageProgress(100);
        setOverallProgress(100);
        setOutputPath(data.outputPath);

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        if (onComplete) {
          onComplete({
            outputPath: data.outputPath,
            duration: data.duration,
            uploadId,
            projectId: data.projectId || null,
            subtitles: data.subtitles || null,
          });
        }
        return;
      }

      if (data.status === 'error') {
        setStatus('error');
        setError(data.error || 'Verarbeitung fehlgeschlagen');

        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        if (onError) {
          onError(data.error);
        }
        return;
      }

      if (data.stage) setCurrentStage(data.stage);
      if (data.stageProgress !== undefined) setStageProgress(data.stageProgress);
      if (data.overallProgress !== undefined) setOverallProgress(data.overallProgress);
    } catch (err) {
      console.error('[AutoProcessingScreen] Poll error:', err);
    }
  }, [uploadId, onComplete, onError]);

  useEffect(() => {
    if (!uploadId) return;

    startTimeRef.current = Date.now();
    pollProgress();

    pollingRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const interval = elapsed > EXTENDED_POLL_THRESHOLD ? POLL_INTERVAL_EXTENDED : POLL_INTERVAL;

      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = setInterval(pollProgress, interval);
      }

      pollProgress();
    }, POLL_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [uploadId, pollProgress]);

  const renderStageIcon = (stage: Stage, isActive: boolean, isCompleted: boolean) => {
    const Icon = stage.Icon;

    if (isCompleted) {
      return (
        <motion.div
          className="flex size-8 items-center justify-center rounded-full bg-primary-500 text-white"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <MdCheck />
        </motion.div>
      );
    }

    if (isActive) {
      return (
        <motion.div
          className="flex size-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/30"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Icon />
        </motion.div>
      );
    }

    return (
      <div className="flex size-8 items-center justify-center rounded-full bg-grey-200 text-grey-400 dark:bg-grey-700 dark:text-grey-500">
        <Icon />
      </div>
    );
  };

  if (status === 'error') {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex max-w-[500px] flex-col items-center gap-lg text-center">
          <motion.div
            className="flex size-16 items-center justify-center rounded-full bg-red-100 text-3xl text-red-600 dark:bg-red-900/30"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <MdError />
          </motion.div>
          <h2 className="text-xl font-semibold text-foreground-heading">
            Verarbeitung fehlgeschlagen
          </h2>
          <p className="text-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex w-full max-w-[500px] flex-col items-center gap-lg text-center">
        <h2 className="text-xl font-semibold text-foreground-heading">
          Automatische Verarbeitung
        </h2>
        <p className="text-grey-500">Dein Video wird automatisch optimiert</p>

        <div className="flex w-full items-center gap-sm">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
            <motion.div
              className="h-full rounded-full bg-primary-500"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="min-w-[3ch] text-sm font-medium text-foreground tabular-nums">
            {Math.round(overallProgress)}%
          </span>
        </div>

        <div className="flex w-full flex-col gap-xs">
          {STAGES.map((stage) => {
            const isActive = stage.id === currentStage;
            const isCompleted =
              stage.id < currentStage || (stage.id === currentStage && status === 'complete');

            return (
              <motion.div
                key={stage.id}
                className={cn(
                  'relative flex items-center gap-md rounded-lg p-sm transition-colors',
                  isActive && 'bg-primary-50 dark:bg-grey-800',
                  isCompleted && 'opacity-70'
                )}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: stage.id * 0.1 }}
              >
                {renderStageIcon(stage, isActive, isCompleted)}
                <div className="flex flex-1 items-center gap-sm">
                  <span
                    className={cn(
                      'text-sm',
                      isActive
                        ? 'font-medium text-foreground'
                        : isCompleted
                          ? 'text-foreground'
                          : 'text-grey-400 dark:text-grey-500'
                    )}
                  >
                    {stage.name}
                  </span>
                  {isActive && stageProgress > 0 && stageProgress < 100 && (
                    <span className="text-xs text-grey-500 tabular-nums">
                      {Math.round(stageProgress)}%
                    </span>
                  )}
                </div>
                {isActive && (
                  <motion.div
                    className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-primary-500"
                    layoutId="activeIndicator"
                  />
                )}
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {status === 'complete' && (
            <motion.div
              className="flex items-center gap-sm font-medium text-primary-600"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <MdCheck className="text-lg" />
              <span>Verarbeitung abgeschlossen!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AutoProcessingScreen;
