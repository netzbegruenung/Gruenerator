import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MdSearch, MdContentCut, MdSubtitles, MdCheck, MdError } from 'react-icons/md';
import type { IconType } from 'react-icons';
import apiClient from '../../../components/utils/apiClient';
import '../styles/AutoProcessingScreen.css';

interface Stage {
  id: number;
  name: string;
  Icon: IconType;
}

const STAGES: Stage[] = [
  { id: 1, name: 'Video wird analysiert...', Icon: MdSearch },
  { id: 2, name: 'Stille Teile werden entfernt...', Icon: MdContentCut },
  { id: 3, name: 'Untertitel werden generiert...', Icon: MdSubtitles },
  { id: 4, name: 'Wird fertiggestellt...', Icon: MdCheck }
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

const AutoProcessingScreen: React.FC<AutoProcessingScreenProps> = ({ uploadId, onComplete, onError }) => {
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
            subtitles: data.subtitles || null
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
          className="stage-icon completed"
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
          className="stage-icon active"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <Icon />
        </motion.div>
      );
    }

    return (
      <div className="stage-icon pending">
        <Icon />
      </div>
    );
  };

  if (status === 'error') {
    return (
      <div className="auto-processing-screen error">
        <div className="auto-processing-content">
          <motion.div
            className="error-icon"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <MdError />
          </motion.div>
          <h2>Verarbeitung fehlgeschlagen</h2>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auto-processing-screen">
      <div className="auto-processing-content">
        <h2>Automatische Verarbeitung</h2>
        <p className="auto-processing-subtitle">
          Dein Video wird automatisch optimiert
        </p>

        <div className="progress-container">
          <div className="progress-bar-wrapper">
            <motion.div
              className="progress-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="progress-percentage">{Math.round(overallProgress)}%</span>
        </div>

        <div className="stages-container">
          {STAGES.map((stage) => {
            const isActive = stage.id === currentStage;
            const isCompleted = stage.id < currentStage || (stage.id === currentStage && status === 'complete');

            return (
              <motion.div
                key={stage.id}
                className={`stage-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: stage.id * 0.1 }}
              >
                {renderStageIcon(stage, isActive, isCompleted)}
                <div className="stage-info">
                  <span className="stage-name">{stage.name}</span>
                  {isActive && stageProgress > 0 && stageProgress < 100 && (
                    <span className="stage-progress">{Math.round(stageProgress)}%</span>
                  )}
                </div>
                {isActive && (
                  <motion.div
                    className="stage-indicator"
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
              className="completion-message"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <MdCheck className="completion-icon" />
              <span>Verarbeitung abgeschlossen!</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AutoProcessingScreen;
