import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';
import { useHistoryStore } from '../stores/historyStore';
import { useWizardStore, type WizardStep } from '../stores/wizardStore';
import { segmentsToTranscript } from '../utils/segmentsToTranscript';

import { EditorStep } from './EditorStep';
import { ImportStep } from './ImportStep';
import { ProcessingStep } from './ProcessingStep';

const STEP_LABELS: Record<string, string> = {
  import: 'Import',
  processing: 'Verarbeitung',
  editor: 'Editor',
};

const STEPS: WizardStep[] = ['import', 'processing', 'editor'];

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-sm py-sm">
      {STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <div key={step} className="flex items-center gap-xs">
            {i > 0 && (
              <div
                className={`h-px w-8 transition-colors ${isDone ? 'bg-primary-500' : 'bg-grey-300 dark:bg-grey-600'}`}
              />
            )}
            <div className="flex items-center gap-xs">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-500 text-white'
                    : isDone
                      ? 'bg-primary-500/20 text-primary-600 dark:text-primary-400'
                      : 'bg-grey-200 text-grey-500 dark:bg-grey-700 dark:text-grey-400'
                }`}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span
                className={`text-sm transition-colors ${
                  isActive
                    ? 'font-medium text-foreground'
                    : isDone
                      ? 'text-foreground-heading'
                      : 'text-grey-400 dark:text-grey-500'
                }`}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubStudioPageInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const step = useWizardStore((s) => s.step);
  const projectId = useWizardStore((s) => s.projectId);
  const uploadId = useWizardStore((s) => s.uploadId);
  const loadExistingProject = useWizardStore((s) => s.loadExistingProject);
  const setStep = useWizardStore((s) => s.setStep);
  const setProjectId = useWizardStore((s) => s.setProjectId);
  const setTranscript = useHistoryStore((s) => s.setTranscript);
  const deepLinkLoadedRef = useRef(false);

  // Deep-link: ?project=<id> jumps straight to editor
  useEffect(() => {
    const paramProjectId = searchParams.get('project');
    if (!paramProjectId || !user?.id || deepLinkLoadedRef.current) return;
    deepLinkLoadedRef.current = true;

    apiClient
      .get(`/subtitler/projects/${paramProjectId}`)
      .then((res) => {
        const p = res.data?.project as { subtitles?: string | null } | undefined;
        if (!p) return;

        if (p.subtitles) {
          setTranscript(segmentsToTranscript(p.subtitles));
        }
        loadExistingProject(paramProjectId);
        setSearchParams({}, { replace: true });
      })
      .catch(() => {
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, user?.id, setSearchParams, loadExistingProject, setTranscript]);

  // Browser history navigation
  useEffect(() => {
    window.history.replaceState({ step }, '', window.location.pathname);
  }, [step]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const s = (event.state as { step?: string } | null)?.step;
      if (s && STEPS.includes(s as WizardStep)) {
        setStep(s as WizardStep);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setStep]);

  const handleProcessingComplete = useCallback(
    (result: { projectId: string | null; subtitles: string | null; uploadId: string }) => {
      if (result.projectId) {
        setProjectId(result.projectId);
      }
      if (result.subtitles) {
        setTranscript(segmentsToTranscript(result.subtitles));
      }
      setStep('editor');
    },
    [setProjectId, setTranscript, setStep]
  );

  return (
    <div className="flex h-[calc(100dvh-64px)] flex-col overflow-hidden">
      {step !== 'editor' && (
        <div className="border-b border-grey-200 bg-background dark:border-grey-700">
          <StepIndicator currentStep={step} />
        </div>
      )}

      <div className="min-h-0 flex-1">
        {step === 'import' && <ImportStep />}
        {step === 'processing' && uploadId && (
          <ProcessingStep uploadId={uploadId} onComplete={handleProcessingComplete} />
        )}
        {step === 'editor' && projectId && <EditorStep projectId={projectId} />}
      </div>
    </div>
  );
}

export default withAuthRequired(SubStudioPageInner);
