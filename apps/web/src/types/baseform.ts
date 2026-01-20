import type { ComponentType, ReactNode, HTMLAttributes, CSSProperties } from 'react';
import type { Control, FieldValues } from 'react-hook-form';

// =============================================================================
// Error Types
// =============================================================================

export type ErrorValue = string | Error | { message?: string } | null;

// =============================================================================
// Feature Toggle Types (Legacy + New)
// =============================================================================

/** Individual feature toggle shape - used for each feature toggle prop */
export interface FeatureToggle {
  isActive: boolean;
  onToggle?: (checked: boolean) => void;
  label: string;
  icon?: ComponentType;
  description?: string;
  tabIndex?: number;
  isSearching?: boolean;
  statusMessage?: string;
}

/** NEW: Consolidated feature config (replaces 3 separate props per feature) */
export interface FeatureConfig {
  /** Whether the feature toggle should be shown (was: useXxxFeatureToggle) */
  enabled?: boolean;
  /** The toggle configuration (was: xxxFeatureToggle) */
  toggle?: FeatureToggle;
  /** Additional config (was: xxxConfig) */
  config?: {
    isActive?: boolean;
    isSearching?: boolean;
    statusMessage?: string;
  };
}

/** NEW: All features in single prop - use this instead of individual props */
export interface FeaturesConfig {
  webSearch?: FeatureConfig;
  privacyMode?: FeatureConfig;
  proMode?: FeatureConfig;
  interactiveMode?: FeatureConfig;
}

// =============================================================================
// Platform & Knowledge Types
// =============================================================================

export interface PlatformOption {
  id: string;
  label: string;
}

export interface PlatformConfig {
  enabled?: boolean;
  options?: PlatformOption[];
  label?: string;
  placeholder?: string;
  helpText?: string;
  tabIndex?: number;
}

// =============================================================================
// Tab Index Types
// =============================================================================

export interface TabIndexConfig {
  featureIcons?: {
    webSearch?: number;
    privacyMode?: number;
    attachment?: number;
  };
  platformSelector?: number;
  knowledgeSelector?: number;
  knowledgeSourceSelector?: number;
  documentSelector?: number;
  submitButton?: number;
}

// =============================================================================
// Submit & Form Types
// =============================================================================

export interface SubmitConfig {
  showButton?: boolean;
  buttonText?: string;
  buttonProps?: Record<string, unknown>;
}

/** NEW: Consolidated UI configuration (replaces 7+ individual props) */
export interface FormUIConfig {
  /** Enable knowledge base selector */
  enableKnowledgeSelector?: boolean;
  /** Show profile selector for user profiles */
  showProfileSelector?: boolean;
  /** Show image upload component */
  showImageUpload?: boolean;
  /** Enable edit mode for generated content */
  enableEditMode?: boolean;
  /** Use markdown rendering for content */
  useMarkdown?: boolean | null;
  /** Hide the display container completely */
  hideDisplayContainer?: boolean;
  /** Use start page layout with prompts */
  useStartPageLayout?: boolean;
}

export interface FormControl {
  control?: Control<FieldValues>;
  register?: unknown;
  setValue?: (name: string, value: unknown) => void;
  getValues?: () => Record<string, unknown>;
  formState?: {
    errors?: Record<string, unknown>;
    isDirty?: boolean;
    isValid?: boolean;
  };
}

// =============================================================================
// Content Types
// =============================================================================

export type GeneratedContent =
  | string
  | { content: string; metadata?: Record<string, unknown> }
  | { sharepic?: unknown; social?: unknown; content?: string; metadata?: unknown };

export interface ContentMetadata {
  title?: string;
  contentType?: string;
  citations?: unknown[];
  enrichmentSummary?: Record<string, unknown>;
}

// =============================================================================
// Help & Export Types
// =============================================================================

export interface HelpContent {
  content: string;
  tips?: string[];
  isNewFeature?: boolean;
  featureId?: string;
  fallbackContent?: string;
  fallbackTips?: string[];
  features?: unknown;
}

export interface CustomExportOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

// =============================================================================
// Question & Answer Types (Interactive Mode)
// =============================================================================

export interface QuestionSkipOption {
  text: string;
  emoji: string;
}

export interface Question {
  id: string;
  text: string;
  type: string;
  questionFormat?: 'yes_no' | 'multiple_choice';
  options: string[];
  optionEmojis?: string[];
  allowCustom?: boolean;
  allowMultiSelect?: boolean;
  placeholder?: string;
  refersTo?: string;
  skipOption?: QuestionSkipOption;
}

// =============================================================================
// Example Prompt Types
// =============================================================================

export interface ExamplePrompt {
  icon?: string | ReactNode;
  label?: string;
  text?: string;
  prompt?: string;
  platforms?: string[];
}

export interface ContextualTip {
  text: string;
  icon?: ReactNode;
}

// =============================================================================
// Form Card Types
// =============================================================================

export type FormCardVariant = 'elevated' | 'floating' | 'subtle';
export type FormCardSize = 'small' | 'medium' | 'large';

export interface FormCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  className?: string;
  variant?: FormCardVariant;
  size?: FormCardSize;
  hover?: boolean;
  title?: string | ReactNode | null;
  subtitle?: string;
  showHideButton?: boolean;
  onHide?: (() => void) | null;
  children: ReactNode;
  isStartMode?: boolean;
}

// =============================================================================
// Error Display Types
// =============================================================================

export interface ErrorDisplayProps {
  error?: string | null;
  onDismiss?: () => void;
}

// =============================================================================
// Example Prompts Types
// =============================================================================

export interface ExamplePromptsProps {
  prompts?: ExamplePrompt[];
  onPromptClick?: ((prompt: ExamplePrompt) => void) | null;
  className?: string;
  /** Array of platform IDs that are currently selected - used to highlight selected platform tags */
  selectedPlatforms?: string[];
}

// =============================================================================
// Content Renderer Types
// =============================================================================

export interface ContentRendererProps {
  value?: string | GeneratedContent | null;
  generatedContent?: GeneratedContent;
  useMarkdown?: boolean | null;
  componentName?: string;
  helpContent?: HelpContent | string | null;
  onEditModeToggle?: () => void;
  isEditModeActive?: boolean;
}

// =============================================================================
// Question Answer Section Types
// =============================================================================

export interface QuestionAnswerSectionProps {
  questions?: Question[];
  answers?: Record<string, string | string[]>;
  onAnswerChange?: (questionId: string, answer: string | string[]) => void;
  questionRound?: number;
  onSubmit?: () => void;
  loading?: boolean;
  success?: boolean;
  submitButtonProps?: Record<string, unknown>;
  hideSubmitButton?: boolean;
}

// =============================================================================
// Display Section Types
// =============================================================================

export interface DisplaySectionProps {
  value?: string | null;
  generatedContent?: GeneratedContent;
  useMarkdown?: boolean;
  onEditModeToggle?: () => void;
  isEditModeActive?: boolean;
  showEditModeToggle?: boolean;
  displayActions?: ReactNode;
  generatedPost?: unknown;
  onGeneratePost?: () => void;
  onSave?: () => void;
  saveLoading?: boolean;
  title?: string;
  componentName?: string;
  helpContent?: HelpContent | string | null;
  customRenderer?: ReactNode | ((content: GeneratedContent) => ReactNode) | null;
  customEditContent?: ReactNode;
  customExportOptions?: CustomExportOption[];
  hideDefaultExportOptions?: boolean;
  error?: ErrorValue;
  onErrorDismiss?: () => void;
  isStartMode?: boolean;
  showResetButton?: boolean;
  onReset?: () => void;
  renderEmptyState?: () => ReactNode;
  renderActions?: () => ReactNode;
}

// =============================================================================
// Form Input Section Types
// =============================================================================

export interface FormInputSectionProps {
  useModernForm?: boolean;
  defaultValues?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
  formControl?: FormControl | null;
  onFormChange?: ((values: Record<string, unknown>) => void) | null;
  onSubmit?: ((data?: Record<string, unknown>) => void | Promise<void>) | (() => void);
  showSubmitButton?: boolean;
  nextButtonText?: string | null;
  submitButtonProps?: Record<string, unknown>;
  isMultiStep?: boolean;
  onBack?: () => void;
  showBackButton?: boolean;
  formErrors?: Record<string, string>;
  children?: ReactNode | ((formControl: FormControl) => ReactNode);
  enablePlatformSelector?: boolean;
  platformOptions?: PlatformOption[];
  platformSelectorLabel?: string;
  platformSelectorPlaceholder?: string;
  platformSelectorHelpText?: string;
  platformSelectorTabIndex?: number;
  showImageUpload?: boolean;
  uploadedImage?: unknown;
  onImageChange?: ((image: unknown) => void) | null;
  isStartMode?: boolean;
  loading?: boolean;
  success?: boolean;
  inputHeaderContent?: ReactNode;
}

// =============================================================================
// Form Extras Section Types
// =============================================================================

export interface FormExtrasSectionProps {
  balancedModeToggle?: FeatureToggle;
  interactiveModeToggle?: FeatureToggle | null;
  useInteractiveModeToggle?: boolean;
  onAttachmentClick?: ((files: File[]) => void) | (() => void);
  onRemoveFile?: (index: number) => void;
  attachedFiles?: unknown[];
  onSubmit?: ((data?: Record<string, unknown>) => void | Promise<void>) | (() => void);
  showSubmitButton?: boolean;
  nextButtonText?: string | null;
  submitButtonProps?: Record<string, unknown>;
  formNotice?: ReactNode;
  onPrivacyInfoClick?: () => void;
  onWebSearchInfoClick?: () => void;
  children?: ReactNode;
  firstExtrasChildren?: ReactNode;
  isStartMode?: boolean;
  hide?: boolean;
  usePrivacyMode?: boolean;
  featureIconsTabIndex?: {
    webSearch?: number;
    balancedMode?: number;
    attachment?: number;
    anweisungen?: number;
  };
  submitButtonTabIndex?: number;
  formControl?: FormControl | null;
  isMultiStep?: boolean;
  componentName?: string;
  knowledgeSelectorTabIndex?: number;
  knowledgeSourceSelectorTabIndex?: number;
  documentSelectorTabIndex?: number;
  showProfileSelector?: boolean;
  enableKnowledgeSelector?: boolean;
  examplePrompts?: ExamplePrompt[];
  onExamplePromptClick?: ((prompt: ExamplePrompt) => void) | null;
  selectedPlatforms?: string[];
}

// =============================================================================
// Form Section Types
// =============================================================================

export interface FormSectionProps {
  isFormVisible?: boolean;
  isMultiStep?: boolean;
  useEditMode?: boolean;
  isImageEditActive?: boolean;
  isStartMode?: boolean;
  onSubmit?: (data?: Record<string, unknown>) => void | Promise<void>;
  nextButtonText?: string;
  submitButtonProps?: Record<string, unknown>;
  onBack?: () => void;
  showBackButton?: boolean;
  interactiveModeToggle?: FeatureToggle | null;
  useInteractiveModeToggle?: boolean;
  onAttachmentClick?: () => void;
  onRemoveFile?: (index: number) => void;
  onPrivacyInfoClick?: () => void;
  onWebSearchInfoClick?: () => void;
  enablePlatformSelector?: boolean;
  platformOptions?: PlatformOption[];
  platformSelectorLabel?: string;
  platformSelectorPlaceholder?: string;
  platformSelectorHelpText?: string;
  children?: ReactNode | ((formControl: FormControl) => ReactNode);
  formNotice?: ReactNode;
  bottomSectionChildren?: ReactNode;
  firstExtrasChildren?: ReactNode;
  extrasChildren?: ReactNode;
  showHideButton?: boolean;
  onHide?: () => void;
  hideExtrasSection?: boolean;
  formControl?: FormControl;
  useModernForm?: boolean;
  onFormChange?: (values: Record<string, unknown>) => void;
  showImageUpload?: boolean;
  uploadedImage?: unknown;
  onImageChange?: (image: unknown) => void;
  customEditContent?: ReactNode;
  onCloseEditMode?: () => void;
  registerEditHandler?: (handler: () => void) => void;
  enableKnowledgeSelector?: boolean;
  showProfileSelector?: boolean;
  documentSelectorTabIndex?: number;
  startPageDescription?: string;
  examplePrompts?: ExamplePrompt[];
  onExamplePromptClick?: (prompt: ExamplePrompt) => void;
  contextualTip?: ContextualTip;
  tabIndexConfig?: TabIndexConfig;
}

// =============================================================================
// Base Form Types (Main Component)
// =============================================================================

export interface BaseFormProps {
  // Core props
  title?: string | ReactNode;
  subtitle?: string;
  children?: ReactNode | ((formControl: FormControl) => ReactNode);
  onSubmit?: (data?: Record<string, unknown>) => void | Promise<void>;
  loading?: boolean;
  success?: boolean;
  error?: ErrorValue;
  formErrors?: Record<string, string>;

  // Generation callbacks
  onGeneratePost?: () => void | Promise<void>;
  generatedPost?: string;
  onEditSubmit?: ((content: string) => void | Promise<void>) | null;

  // Advanced configuration
  submitButtonProps?: Record<string, unknown>;
  headerContent?: ReactNode;
  defaultValues?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
  useModernForm?: boolean;
  onFormChange?: ((values: Record<string, unknown>) => void) | null;
  formControl?: FormControl | null;

  // Generated content
  generatedContent?: GeneratedContent;
  onGeneratedContentChange?: ((content: string) => void) | null;
  initialContent?: string;
  /** @deprecated Use `uiConfig.hideDisplayContainer` instead */
  hideDisplayContainer?: boolean;
  customRenderer?: ((props: {
    content: unknown;
    generatedContent: unknown;
    componentName: string;
    helpContent?: HelpContent | null;
    onEditModeToggle?: () => void;
  }) => ReactNode) | null;
  /** @deprecated Use `uiConfig.useMarkdown` instead */
  useMarkdown?: boolean | null;

  // Help content
  helpContent?: HelpContent | null;

  // Display section
  displayActions?: ReactNode;
  formNotice?: ReactNode;

  // Loading states
  saveLoading?: boolean;

  // Navigation
  /** @deprecated Form no longer auto-collapses */
  disableAutoCollapse?: boolean;
  showNextButton?: boolean;
  nextButtonText?: string;

  // NEW: Consolidated configuration props (preferred over individual props)
  /** Consolidated feature toggle configuration */
  features?: FeaturesConfig;
  /** Consolidated tab index configuration */
  tabIndexConfig?: TabIndexConfig;
  /** Consolidated platform selector configuration */
  platformConfig?: PlatformConfig;
  /** Consolidated submit button configuration */
  submitConfig?: SubmitConfig | null;
  /** Consolidated UI-related configuration */
  uiConfig?: FormUIConfig;

  // DEPRECATED: Legacy feature props (use features prop instead)
  /** @deprecated Use `features.webSearch` instead */
  webSearchFeatureToggle?: FeatureToggle | null;
  /** @deprecated Use `features.webSearch.enabled` instead */
  useWebSearchFeatureToggle?: boolean;
  /** @deprecated Use `features.webSearch.config` instead */
  webSearchConfig?: FeatureConfig['config'] | null;

  /** @deprecated Use `features.privacyMode` instead */
  privacyModeToggle?: FeatureToggle | null;
  /** @deprecated Use `features.privacyMode.enabled` instead */
  usePrivacyModeToggle?: boolean;
  /** @deprecated Use `features.privacyMode.config` instead */
  privacyModeConfig?: FeatureConfig['config'] | null;

  /** @deprecated Use `features.proMode` instead */
  proModeToggle?: FeatureToggle | null;
  /** @deprecated Use `features.proMode.enabled` instead */
  useProModeToggle?: boolean;
  /** @deprecated Use `features.proMode.config` instead */
  proModeConfig?: FeatureConfig['config'] | null;

  /** @deprecated Use `features.interactiveMode` instead */
  interactiveModeToggle?: FeatureToggle | null;
  /** @deprecated Use `features.interactiveMode.enabled` instead */
  useInteractiveModeToggle?: boolean;
  /** @deprecated Use `features.interactiveMode.config` instead */
  interactiveModeConfig?: FeatureConfig['config'] | null;

  // Feature icons
  useFeatureIcons?: boolean;

  // DEPRECATED: Legacy UI props (use uiConfig instead)
  /** @deprecated Use `uiConfig.showImageUpload` instead */
  showImageUpload?: boolean;
  uploadedImage?: unknown;
  onImageChange?: ((image: unknown) => void) | null;
  onImageEditModeChange?: ((isActive: boolean) => void) | null;

  /** @deprecated Use `uiConfig.enableEditMode` instead */
  enableEditMode?: boolean;
  customEditContent?: ReactNode;

  // DEPRECATED: Legacy platform props (use platformConfig instead)
  /** @deprecated Use `platformConfig.enabled` instead */
  enablePlatformSelector?: boolean;
  /** @deprecated Use `platformConfig.options` instead */
  platformOptions?: PlatformOption[];
  /** @deprecated Use `platformConfig.label` instead */
  platformSelectorLabel?: string;
  /** @deprecated Use `platformConfig.placeholder` instead */
  platformSelectorPlaceholder?: string;
  /** @deprecated Use `platformConfig.helpText` instead */
  platformSelectorHelpText?: string;

  // DEPRECATED: Legacy knowledge/UI props (use uiConfig instead)
  /** @deprecated Use `uiConfig.enableKnowledgeSelector` instead */
  enableKnowledgeSelector?: boolean;
  /** @deprecated Use `uiConfig.showProfileSelector` instead */
  showProfileSelector?: boolean;
  documentSelectorTabIndex?: number;
  knowledgeSelectorTabIndex?: number;
  knowledgeSourceSelectorTabIndex?: number;

  // Start page layout props
  /** @deprecated Use `uiConfig.useStartPageLayout` instead */
  useStartPageLayout?: boolean;
  startPageDescription?: string | null;
  examplePrompts?: ExamplePrompt[];
  onExamplePromptClick?: ((prompt: ExamplePrompt) => void) | null;
  contextualTip?: ContextualTip | null;
  /** Array of platform IDs that are currently selected - used to highlight selected platform tags */
  selectedPlatforms?: string[];

  // DEPRECATED: Legacy tab index props (use tabIndexConfig instead)
  /** @deprecated Use `tabIndexConfig.featureIcons` instead */
  featureIconsTabIndex?: {
    webSearch?: number;
    privacyMode?: number;
    attachment?: number;
  };
  /** @deprecated Use `tabIndexConfig.platformSelector` or `platformConfig.tabIndex` instead */
  platformSelectorTabIndex?: number;
  /** @deprecated Use `tabIndexConfig.submitButton` instead */
  submitButtonTabIndex?: number;

  // Submit button configuration
  submitButtonText?: string;
  isSubmitDisabled?: boolean;

  // Export options
  customExportOptions?: CustomExportOption[];
  hideDefaultExportOptions?: boolean;

  // Accessibility
  accessibilityOptions?: Record<string, unknown>;

  // Other
  componentName?: string;
  onSave?: () => void;
  extrasChildren?: ReactNode;
  firstExtrasChildren?: ReactNode;
  bottomSectionChildren?: ReactNode;
  hideFormExtras?: boolean;
  /** Hide the input section entirely (used in approval mode workflows) */
  hideInputSection?: boolean;

  // File attachments
  attachedFiles?: unknown[];
  onAttachmentClick?: (files?: File[]) => void;
  onRemoveFile?: (index: number) => void;

  // Multi-step
  isMultiStep?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;

  // New addition
  inputHeaderContent?: ReactNode;

  // Style
  style?: CSSProperties;
  className?: string;
}

// =============================================================================
// Re-export utility type for extracting features from legacy props
// =============================================================================

export type ExtractedFeatures = {
  webSearch: FeatureConfig;
  privacyMode: FeatureConfig;
  proMode: FeatureConfig;
  interactiveMode: FeatureConfig;
};
