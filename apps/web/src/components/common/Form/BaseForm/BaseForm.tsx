import type {
  BaseFormProps,
  FeatureToggle,
  HelpContent,
  ExamplePrompt,
  ContextualTip,
  CustomExportOption,
  PlatformOption,
  FormControl,
  GeneratedContent,
} from '@/types/baseform';

import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';

import isEqual from 'fast-deep-equal';
import { motion, AnimatePresence } from 'motion/react';
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  lazy,
  Suspense,
} from 'react';

// Import non-baseform CSS (these stay — they style shared UI primitives)
import '../../../../assets/styles/components/ui/forms.css';
import '../../../../assets/styles/components/ui/form-select-modern.css';
import '../../../../assets/styles/components/ui/form-toggle-button.css';
import '../../../../assets/styles/components/ui/quote-form.css';
import '../../../../assets/styles/components/ui/FeatureToggle.css';
import '../../../../assets/styles/components/ui/AttachedFilesList.css';
import '../../../../assets/styles/components/ui/button.css';
import '../../../../assets/styles/components/ui/spinner.css';
import '../../../../assets/styles/components/ui/tooltip.css';
import '../../../../assets/styles/components/ui/react-select.css';
import '../../../../assets/styles/components/ui/knowledge-selector.css';
import '../../../../assets/styles/components/ui/animatedcheckbox.css';
import '../../../../assets/styles/components/ui/SegmentedControl.css';
import '../../../../assets/styles/components/form/form-inputs.css';
import '../../../../assets/styles/components/form/file-upload.css';
import '../../../../assets/styles/components/help-tooltip.css';

import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import { useTextAutoSave } from '../../../../hooks/useTextAutoSave';
import { getDocumentType } from '../../../../utils/documentTypeMapper';
import RecentTextsSection from '../../RecentTexts/RecentTextsSection';
import { BaseFormProvider } from '../BaseFormContext';
import { useErrorHandling, useResponsive, useAutoScrollToContent } from '../hooks';
import { useBaseFormAccessibility } from '../hooks/useBaseFormAccessibility';
import { useContentManagement } from '../hooks/useContentManagement';
import { getExportableContent } from '../utils/contentUtils';

import DisplaySection from './DisplaySection';
import FormSection from './FormSection';
import { FormToggleButtonFAB } from './FormToggleButtonFAB';

import { cn } from '@/utils/cn';

const Tooltip = lazy(() => import('react-tooltip').then((mod) => ({ default: mod.Tooltip })));

const BaseForm: React.FC<BaseFormProps> = ({
  title,
  subtitle,
  children,
  onSubmit,
  loading = false,
  success = false,
  error: propError,
  formErrors = {},
  onGeneratePost,
  generatedPost,
  initialContent = '',
  isMultiStep = false,
  onBack,
  showBackButton = false,
  nextButtonText,
  generatedContent,
  customRenderer = null,

  helpContent,
  submitButtonProps = {},
  showNextButton = true,
  submitConfig = null,
  headerContent,
  features,
  useFeatureIcons = false,
  showAgentMode = false,
  onAttachmentClick,
  onRemoveFile,
  attachedFiles = [],
  displayActions = null,
  formNotice = null,
  enablePlatformSelector = false,
  platformOptions = [],
  platformSelectorLabel = undefined,
  platformSelectorPlaceholder = undefined,
  platformSelectorHelpText = undefined,
  formControl = null,
  onSave,
  saveLoading = false,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  accessibilityOptions = {},
  bottomSectionChildren = null,
  componentName = 'default',
  firstExtrasChildren = null,
  extrasChildren = null,
  useMarkdown = null,
  customEditContent = null,
  featureIconsTabIndex = {
    webSearch: 11,
    privacyMode: 12,
    attachment: 13,
  },
  platformSelectorTabIndex = 12,
  knowledgeSelectorTabIndex = 14,
  knowledgeSourceSelectorTabIndex = 13,
  showProfileSelector = true,
  documentSelectorTabIndex = 15,
  submitButtonTabIndex = 17,
  showImageUpload = false,
  uploadedImage = null,
  onImageChange = null,
  enableKnowledgeSelector = false,
  hideFormExtras = false,
  hideInputSection = false,
  showResetButton = false,
  onReset,
  onImageEditModeChange = null,
  customExportOptions = [],
  hideDefaultExportOptions = false,
  useStartPageLayout = false,
  startPageDescription = null,
  examplePrompts = [],
  onExamplePromptClick = null,
  contextualTip = null,
  selectedPlatforms = [],
  inputHeaderContent = null,
  streamingProgress,
  isStreaming = false,
  abortStreaming,
}) => {
  const baseFormRef = useRef<HTMLDivElement>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const displaySectionRef = useRef<HTMLDivElement>(null);
  const [inlineHelpContentOverride, setInlineHelpContentOverride] = useState<HelpContent | null>(
    null
  );

  // Form visibility (inlined from useFormVisibility)
  const [isFormVisible, setIsFormVisible] = useState(true);
  const toggleFormVisibility = useCallback(() => setIsFormVisible((prev) => !prev), []);

  const errorHandling = useErrorHandling() as {
    error: string;
    setError: (error: string | Error | null) => void;
    getErrorMessage: (error: string) => string;
    handleSubmitError: (error: Error) => void;
    clearError: () => void;
  };
  const error = errorHandling.error;
  const setError = errorHandling.setError;

  // Content management hook
  const content = useContentManagement({
    componentName,
    generatedContent,
    initialContent,
  });

  const { value, hasEditableContent, hasAnyContent, handleLoadRecentText } = content;

  // Responsive hook
  const responsiveState = useResponsive() as {
    isMobileView: boolean;
    updateMobileState: () => void;
    getDisplayTitle: (
      title: string,
      isEditing: boolean,
      generatedContent: GeneratedContent | undefined
    ) => string;
  };
  const { isMobileView, getDisplayTitle } = responsiveState;

  // Image edit mode state
  const [isImageEditActive, setIsImageEditActive] = useState(false);
  const handleToggleImageEdit = useCallback(() => {
    const newState = !isImageEditActive;
    setIsImageEditActive(newState);
    if (onImageEditModeChange) onImageEditModeChange(newState);
  }, [isImageEditActive, onImageEditModeChange]);

  // Start mode (inlined from useStartMode)
  const isStartMode = useStartPageLayout && !hasAnyContent && !(isStreaming || loading);
  const isGenerating = isStreaming || loading;

  // Derived content state
  const hasContent =
    generatedContent &&
    (typeof generatedContent === 'string'
      ? generatedContent.length > 0
      : ((generatedContent as { content?: string; sharepic?: unknown }).content?.length ?? 0) > 0 ||
        !!(generatedContent as { sharepic?: unknown }).sharepic);

  const noContentColumn = !hasContent && !isStartMode && !isGenerating;

  // Submit config resolution (inlined from useFormConfiguration)
  const resolvedSubmitConfig = useMemo(
    () => ({
      showButton: submitConfig?.showButton ?? showNextButton,
      buttonText: submitConfig?.buttonText ?? nextButtonText,
    }),
    [submitConfig, showNextButton, nextButtonText]
  );

  const effectiveSubmitButtonProps = useMemo(
    () => (submitConfig?.buttonProps || submitButtonProps || {}) as Record<string, unknown>,
    [submitConfig, submitButtonProps]
  );

  // Feature config resolution (inlined from useFeatureConfigs)
  const resolvedInteractiveModeConfig = useMemo(
    () => ({
      enabled: features?.interactiveMode?.enabled ?? false,
      toggle: features?.interactiveMode?.toggle,
    }),
    [features?.interactiveMode]
  );

  // Auto-scroll to generated text on mobile
  useAutoScrollToContent(displaySectionRef, hasEditableContent, {
    mobileOnly: true,
    mobileBreakpoint: 768,
    delay: 100,
    topOffset: 80,
    centerThreshold: 0.8,
  });

  // Exportable content
  const valueAsString = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
  const getExportableContentCallback = useCallback(
    (content: unknown) => {
      const safeContent =
        typeof content === 'string' ? content : content ? JSON.stringify(content) : '';
      return getExportableContent(safeContent, valueAsString);
    },
    [valueAsString]
  );

  // Accessibility hook
  const { handleFormError, handleFormSuccess } = useBaseFormAccessibility({
    baseFormRef,
    generatedContent,
    children,
    accessibilityOptions,
  });

  // Sync error from props (inlined from useFormStateSyncing, error-only portion)
  const prevErrorRef = useRef(propError);
  useEffect(() => {
    const prev = prevErrorRef.current;
    const next = propError;
    prevErrorRef.current = next;

    if (!next) return;
    if (prev === next) return;

    let errorMessage = 'Ein Fehler ist aufgetreten';
    if (typeof next === 'string') {
      errorMessage = next;
    } else if (next instanceof Error) {
      errorMessage = next.message || errorMessage;
    } else if (next && typeof next === 'object' && 'message' in next) {
      errorMessage = (next as { message?: string }).message || errorMessage;
    }

    if (typeof next === 'string' || next instanceof Error) {
      setError(next);
    } else {
      setError(errorMessage);
    }
    handleFormError(errorMessage, 'form');
  }, [propError, setError, handleFormError]);

  // Event handlers (inlined from useFormEventHandlers)
  const handleEnhancedSubmit = useCallback(
    async (formData?: Record<string, unknown>) => {
      try {
        const enhancedFormData = {
          ...formData,
          useBedrock: features?.proMode?.toggle?.isActive || false,
          useWebSearchTool:
            features?.webSearch?.toggle?.isActive ||
            (formData?.useWebSearchTool as boolean) ||
            false,
          usePrivacyMode:
            features?.privacyMode?.toggle?.isActive ||
            (formData?.usePrivacyMode as boolean) ||
            false,
        };

        await onSubmit?.(enhancedFormData);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten';
        handleFormError(errorMessage);
      }
    },
    [onSubmit, features, handleFormError]
  );

  const handleExamplePromptClick = useCallback(
    (prompt: ExamplePrompt) => {
      onExamplePromptClick?.(prompt);
    },
    [onExamplePromptClick]
  );

  const handlePrivacyInfoClick = useCallback(() => {
    setInlineHelpContentOverride({
      content: 'Privacy-Mode: Alles wird in Deutschland verarbeitet - beste Datenschutz-Standards.',
      tips: [
        'Server: IONOS und netzbegruenung.de',
        'PDFs: maximal 10 Seiten',
        'Bilder werden ignoriert',
      ],
    });
  }, []);

  const handleWebSearchInfoClick = useCallback(() => {
    setInlineHelpContentOverride({
      content:
        'Die Websuche durchsucht das Internet nach aktuellen und relevanten Informationen, um deine Eingaben zu ergänzen. Nützlich, wenn du wenig Vorwissen zum Thema hast oder aktuelle Daten benötigst.',
    });
  }, []);

  const handleErrorDismiss = useCallback(() => {
    setError(null);
  }, [setError]);

  // Auto-save hook
  const { getBetaFeatureState: getAutoSaveFeatureState } = useBetaFeatures();
  useTextAutoSave({
    componentName,
    enabled: getAutoSaveFeatureState('autoSaveGenerated'),
    debounceMs: 3000,
  });

  // Display title
  const displayTitle = useMemo(() => {
    const computedTitle = getDisplayTitle('', false, generatedContent);
    return typeof computedTitle === 'string' ? computedTitle : '';
  }, [getDisplayTitle, generatedContent]);

  // Container classes — inlined from classNameUtils
  const baseContainerClasses = useMemo(
    () =>
      cn(
        'base-container flex w-full max-w-[1200px] mx-auto my-lg gap-md relative items-stretch transition-all duration-400',
        'max-md:p-0 max-md:flex-col max-md:gap-5 max-md:max-w-full max-md:m-0',
        'xl:max-w-[1400px] xl:gap-lg 3xl:max-w-[1600px] 4xl:max-w-[1800px] 5xl:max-w-[2000px]',
        hasContent && 'has-generated-content max-md:p-[10px]',
        isStartMode &&
          'base-container--start-mode flex-col items-center justify-start pt-0 gap-lg max-w-full mx-auto max-md:p-sm max-md:pt-[2vh] max-md:gap-md',
        noContentColumn &&
          'no-content-column flex-col items-center gap-lg max-md:items-stretch max-md:gap-0'
      ),
    [hasContent, isStartMode, noContentColumn]
  );

  return (
    <BaseFormProvider value={{ isStartMode }}>
      <div className="flex flex-col w-full">
        {headerContent}
        <motion.div
          transition={{ duration: 0.25, ease: 'easeOut' }}
          ref={baseFormRef}
          className={baseContainerClasses}
          role="main"
          aria-label={typeof title === 'string' ? title : 'Formular'}
          id="main-content"
        >
          <AnimatePresence initial={false}>
            {!isFormVisible && hasAnyContent && (
              <FormToggleButtonFAB onClick={toggleFormVisibility} />
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {isFormVisible && (
              <motion.div
                key="form-section"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{
                  duration: 0.25,
                  ease: 'easeOut',
                }}
                className={cn(
                  'form-section-motion-wrapper flex-[2] min-w-0',
                  hasContent && 'flex-1',
                  isStartMode &&
                    'max-w-[800px] w-full flex-none xl:max-w-[900px] 2xl:max-w-[1000px] max-md:max-w-full',
                  noContentColumn &&
                    'flex-none w-full max-w-[800px] xl:max-w-[900px] 4xl:max-w-[1000px] max-md:max-w-none'
                )}
              >
                <FormSection
                  ref={formSectionRef}
                  title={title}
                  subtitle={subtitle}
                  onSubmit={useModernForm ? handleEnhancedSubmit : onSubmit}
                  isFormVisible={isFormVisible}
                  isMultiStep={isMultiStep}
                  onBack={onBack}
                  showBackButton={showBackButton}
                  nextButtonText={resolvedSubmitConfig.buttonText}
                  submitButtonProps={effectiveSubmitButtonProps}
                  interactiveModeToggle={
                    resolvedInteractiveModeConfig.enabled
                      ? resolvedInteractiveModeConfig.toggle
                      : null
                  }
                  useInteractiveModeToggle={resolvedInteractiveModeConfig.enabled}
                  onAttachmentClick={onAttachmentClick}
                  onRemoveFile={onRemoveFile}
                  onPrivacyInfoClick={handlePrivacyInfoClick}
                  enablePlatformSelector={enablePlatformSelector}
                  platformOptions={platformOptions}
                  platformSelectorLabel={platformSelectorLabel}
                  platformSelectorPlaceholder={platformSelectorPlaceholder}
                  platformSelectorHelpText={platformSelectorHelpText}
                  formControl={formControl}
                  showSubmitButton={resolvedSubmitConfig.showButton}
                  formNotice={formNotice}
                  defaultValues={defaultValues}
                  validationRules={validationRules}
                  useModernForm={useModernForm}
                  onFormChange={onFormChange}
                  bottomSectionChildren={bottomSectionChildren}
                  showHideButton={hasAnyContent}
                  onHide={toggleFormVisibility}
                  firstExtrasChildren={firstExtrasChildren}
                  extrasChildren={extrasChildren}
                  featureIconsTabIndex={featureIconsTabIndex}
                  platformSelectorTabIndex={platformSelectorTabIndex}
                  knowledgeSelectorTabIndex={knowledgeSelectorTabIndex}
                  knowledgeSourceSelectorTabIndex={knowledgeSourceSelectorTabIndex}
                  documentSelectorTabIndex={documentSelectorTabIndex}
                  submitButtonTabIndex={submitButtonTabIndex}
                  showProfileSelector={showProfileSelector}
                  showImageUpload={showImageUpload}
                  onImageChange={onImageChange}
                  componentName={componentName}
                  onWebSearchInfoClick={handleWebSearchInfoClick}
                  isImageEditActive={isImageEditActive}
                  customEditContent={customEditContent}
                  enableKnowledgeSelector={enableKnowledgeSelector}
                  hideExtrasSection={hideFormExtras}
                  hideInputSection={hideInputSection}
                  isStartMode={isStartMode}
                  startPageDescription={startPageDescription}
                  examplePrompts={examplePrompts}
                  onExamplePromptClick={handleExamplePromptClick}
                  contextualTip={contextualTip}
                  selectedPlatforms={selectedPlatforms}
                  inputHeaderContent={inputHeaderContent}
                  helpContent={helpContent}
                  isStreaming={isStreaming}
                  streamingMessage={streamingProgress?.message}
                  onAbort={abortStreaming}
                  loading={loading}
                  success={success}
                  useFeatureIcons={useFeatureIcons}
                  showAgentMode={showAgentMode}
                  attachedFiles={attachedFiles}
                >
                  {children}
                </FormSection>
              </motion.div>
            )}
          </AnimatePresence>

          {!isStartMode && (hasAnyContent || !!(error || propError)) && (
            <motion.div
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={cn(
                'display-section-motion-wrapper min-w-0 flex',
                isFormVisible && 'flex-1 justify-start',
                hasContent && isFormVisible && 'flex-1',
                !isFormVisible && 'flex-1 justify-center items-start w-full max-w-none m-0',
                noContentColumn &&
                  'flex-none w-full max-w-[800px] xl:max-w-[900px] 4xl:max-w-[1000px] max-md:max-w-none'
              )}
            >
              <DisplaySection
                ref={displaySectionRef}
                title={typeof displayTitle === 'string' ? displayTitle : ''}
                error={error || propError}
                value={valueAsString}
                generatedContent={generatedContent}
                useMarkdown={useMarkdown}
                helpContent={inlineHelpContentOverride || helpContent}
                generatedPost={generatedPost}
                onGeneratePost={onGeneratePost}
                getExportableContent={getExportableContentCallback}
                displayActions={displayActions}
                onSave={onSave}
                saveLoading={saveLoading}
                componentName={componentName}
                onErrorDismiss={handleErrorDismiss}
                onEditModeToggle={customEditContent ? handleToggleImageEdit : undefined}
                customEditContent={customEditContent}
                customRenderer={customRenderer}
                customExportOptions={customExportOptions}
                hideDefaultExportOptions={hideDefaultExportOptions}
                isStartMode={isStartMode}
                showResetButton={showResetButton}
                onReset={onReset}
              />
            </motion.div>
          )}

          {!isMobileView && (
            <Suspense fallback={null}>
              <Tooltip id="action-tooltip" place="bottom" />
            </Suspense>
          )}
        </motion.div>

        {useStartPageLayout && (
          <RecentTextsSection
            generatorType={getDocumentType(componentName)}
            onTextLoad={handleLoadRecentText}
          />
        )}
      </div>
    </BaseFormProvider>
  );
};

// Simplified areEqual — with ~50 props and no store duplication,
// shallow comparison works for most props, deep-equal only for generatedContent
const areEqual = (prevProps: BaseFormProps, nextProps: BaseFormProps): boolean => {
  const callbackProps = [
    'onSubmit',
    'onGeneratedContentChange',
    'onAttachmentClick',
    'onRemoveFile',
    'onFormChange',
    'onImageChange',
    'onSave',
    'onBack',
    'onGeneratePost',
  ];

  for (const [key, value] of Object.entries(nextProps)) {
    if (callbackProps.includes(key)) continue;

    const propKey = key as keyof BaseFormProps;
    const prevValue = prevProps[propKey];

    if (key === 'children') {
      if (React.isValidElement(prevValue) && React.isValidElement(value)) {
        if (prevValue.type !== value.type || prevValue.key !== value.key) {
          return false;
        }
      } else if (prevValue !== value) {
        return false;
      }
    } else if (key === 'generatedContent') {
      if (!isEqual(prevValue, value)) {
        return false;
      }
    } else if (key === 'attachedFiles' || key === 'platformOptions') {
      const prevArr = prevValue as unknown[] | undefined;
      const nextArr = value as unknown[] | undefined;
      if (Array.isArray(prevArr) && Array.isArray(nextArr)) {
        if (prevArr.length !== nextArr.length) return false;
        for (let i = 0; i < prevArr.length; i++) {
          if (prevArr[i] !== nextArr[i]) return false;
        }
      } else if (prevValue !== value) {
        return false;
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      typeof prevValue === 'object' &&
      prevValue !== null
    ) {
      const prevObj = prevValue as Record<string, unknown>;
      const nextObj = value as Record<string, unknown>;
      const prevKeys = Object.keys(prevObj);
      const nextKeys = Object.keys(nextObj);
      if (prevKeys.length !== nextKeys.length) return false;
      for (const objKey of prevKeys) {
        if (prevObj[objKey] !== nextObj[objKey]) return false;
      }
    } else if (prevValue !== value) {
      return false;
    }
  }

  return true;
};

export default React.memo(BaseForm, areEqual);
