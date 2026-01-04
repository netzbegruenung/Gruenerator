import { FORM_STEPS } from '../utils/typeConfig';

export type FormStep = (typeof FORM_STEPS)[keyof typeof FORM_STEPS];

export type StepTrigger =
  | 'generateText'
  | 'generateImage'
  | 'backgroundRemoval'
  | 'parallelPreload';

export interface InputFieldConfig {
  name: string;
  label: string;
  subtitle?: string;
  helpText?: string;
}

export interface NavigableStep {
  id: string;
  type: 'input' | 'image_upload' | 'canvas_edit';
  phase: FormStep;
  field?: InputFieldConfig;
  stepTitle: string | null;
  stepSubtitle: string | null;
  afterComplete: StepTrigger | null;
}

export interface StepPosition {
  phase: FormStep;
  index: number;
  stepId: string;
}

export interface StepNavigationState {
  stepPosition: StepPosition | null;
  stepSequence: NavigableStep[];
  stepDirection: 'forward' | 'back';
  previousStepPosition: StepPosition | null;
  isStepProcessing: boolean;
  processingStepId: string | null;
}

export interface StepNavigationActions {
  initStepSequence: (type: string) => void;
  stepNext: () => Promise<boolean>;
  stepBack: () => boolean;
  stepTo: (stepId: string) => void;
  getCurrentNavigableStep: () => NavigableStep | null;
  getStepIndex: () => number;
  isFirstStep: () => boolean;
  isLastStep: () => boolean;
}

export type StepNavigationSlice = StepNavigationState & StepNavigationActions;
