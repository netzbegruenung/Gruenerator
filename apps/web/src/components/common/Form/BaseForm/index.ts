// Main component export
export { default } from './BaseForm';

// Provider and hooks
export { FormStateProvider, useFormState, useFormStateSelector } from '../FormStateProvider';

// Named component exports for consumers who prefer explicit imports
export { default as BaseForm } from './BaseForm';
export { default as FormSection } from './FormSection';
export { default as DisplaySection } from './DisplaySection';
export { default as FormInputSection } from './FormInputSection';
export { default as FormExtrasSection } from './FormExtrasSection';
export { default as FormCard } from './FormCard';
export { default as ContentRenderer } from './ContentRenderer';
export { default as ErrorDisplay } from './ErrorDisplay';
export { default as ExamplePrompts } from './ExamplePrompts';
export { default as QuestionAnswerSection } from './QuestionAnswerSection';

// Re-export types for convenience
export type {
  BaseFormProps,
  FeatureToggle,
  FeatureConfig,
  FeaturesConfig,
  PlatformOption,
  CustomExportOption,
  HelpContent,
  TabIndexConfig,
  Question,
  GeneratedContent,
  SubmitConfig,
  ExamplePrompt,
  ContextualTip,
  FormControl,
  FormSectionProps,
  DisplaySectionProps,
  FormInputSectionProps,
  FormExtrasSectionProps
} from '@/types/baseform'; 