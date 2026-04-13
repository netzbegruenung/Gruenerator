import { create } from 'zustand';

export type WizardStep = 'import' | 'processing' | 'editor';

interface WizardState {
  step: WizardStep;
  uploadId: string | null;
  projectId: string | null;
  processingError: string | null;
}

interface WizardActions {
  setStep: (step: WizardStep) => void;
  finishUpload: (uploadId: string) => void;
  setProjectId: (projectId: string) => void;
  setProcessingError: (error: string | null) => void;
  loadExistingProject: (projectId: string) => void;
  reset: () => void;
}

const initialState: WizardState = {
  step: 'import',
  uploadId: null,
  projectId: null,
  processingError: null,
};

export const useWizardStore = create<WizardState & WizardActions>()((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  finishUpload: (uploadId) => set({ uploadId, step: 'processing', processingError: null }),

  setProjectId: (projectId) => set({ projectId }),

  setProcessingError: (processingError) => set({ processingError }),

  loadExistingProject: (projectId) => set({ projectId, step: 'editor', processingError: null }),

  reset: () => set(initialState),
}));
