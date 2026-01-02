import React, { forwardRef, useRef, useEffect, useCallback, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { FeatureToggle, PlatformOption, ExamplePrompt, ContextualTip, FormControl } from '@/types/baseform';
import { HiUpload } from 'react-icons/hi';
import FormCard from './FormCard';
import FormInputSection from './FormInputSection';
import FormExtrasSection from './FormExtrasSection';
import ExamplePrompts from './ExamplePrompts';
import InputTip from '../Input/InputTip';
import useResponsive from '../hooks/useResponsive';
import UniversalEditForm from '../EditMode/UniversalEditForm';
import { useFormStateSelector } from '../FormStateProvider';
import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';
import useDragDropFiles from '../../../../hooks/useDragDropFiles';
import '../../../../assets/styles/components/baseform/drag-drop.css';

interface FeatureIconsTabIndex {
  webSearch?: number;
  privacyMode?: number;
  attachment?: number;
}

interface FormSectionProps {
  title?: string;
  onSubmit: () => void;
  isFormVisible: boolean;
  isMultiStep?: boolean;
  onBack?: () => void;
  showBackButton?: boolean;
  nextButtonText?: string;
  submitButtonProps?: Record<string, unknown>;
  interactiveModeToggle?: FeatureToggle;
  useInteractiveModeToggle?: boolean;
  onAttachmentClick?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
  enablePlatformSelector?: boolean;
  platformOptions?: PlatformOption[];
  platformSelectorLabel?: string;
  platformSelectorPlaceholder?: string;
  platformSelectorHelpText?: string;
  formControl?: FormControl | null;
  children: ReactNode | ((formControl: FormControl) => ReactNode);
  showSubmitButton?: boolean;
  formNotice?: ReactNode;
  extrasChildren?: ReactNode;
  defaultValues?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
  useModernForm?: boolean;
  onFormChange?: ((values: Record<string, unknown>) => void) | null;
  bottomSectionChildren?: ReactNode;
  showHideButton?: boolean;
  onHide?: (() => void) | null;
  firstExtrasChildren?: ReactNode;
  hideExtrasSection?: boolean;
  showSubmitButtonInInputSection?: boolean;
  featureIconsTabIndex?: FeatureIconsTabIndex;
  platformSelectorTabIndex?: number;
  knowledgeSelectorTabIndex?: number;
  knowledgeSourceSelectorTabIndex?: number;
  documentSelectorTabIndex?: number;
  submitButtonTabIndex?: number;
  showProfileSelector?: boolean;
  showImageUpload?: boolean;
  uploadedImage?: unknown;
  onImageChange?: ((image: unknown) => void) | null;
  onPrivacyInfoClick?: () => void;
  onWebSearchInfoClick?: () => void;
  componentName?: string;
  useEditMode?: boolean;
  onCloseEditMode?: (() => void) | null;
  isImageEditActive?: boolean;
  registerEditHandler?: ((handler: () => void) => void) | null;
  enableKnowledgeSelector?: boolean;
  customEditContent?: ReactNode;
  isStartMode?: boolean;
  startPageDescription?: string | null;
  examplePrompts?: ExamplePrompt[];
  onExamplePromptClick?: ((prompt: ExamplePrompt) => void) | null;
  contextualTip?: ContextualTip | null;
}

const FormSection = forwardRef<HTMLDivElement, FormSectionProps>(({
  title,
  onSubmit,
  isFormVisible,
  isMultiStep,
  onBack,
  showBackButton,
  nextButtonText,
  submitButtonProps = {},
  // Feature toggle props removed - web search, privacy, and pro mode now use store
  interactiveModeToggle,
  useInteractiveModeToggle,
  onAttachmentClick,
  onRemoveFile,
  enablePlatformSelector = false,
  platformOptions = [],
  platformSelectorLabel = undefined,
  platformSelectorPlaceholder = undefined,
  platformSelectorHelpText = undefined,
  formControl = null,
  children,
  showSubmitButton = true,
  formNotice = null,
  extrasChildren = null,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  bottomSectionChildren = null,
  showHideButton = false,
  onHide = null,
  firstExtrasChildren = null,
  hideExtrasSection = false,
  showSubmitButtonInInputSection = false,
  featureIconsTabIndex = {
    webSearch: 11,
    privacyMode: 12,
    attachment: 13
  },
  platformSelectorTabIndex = 12,
  knowledgeSelectorTabIndex = 14,
  knowledgeSourceSelectorTabIndex = 13,
  documentSelectorTabIndex = 15,
  submitButtonTabIndex = 17,
  showProfileSelector = true,
  showImageUpload = false,
  uploadedImage: propUploadedImage = null,
  onImageChange = null,
  onPrivacyInfoClick,
  onWebSearchInfoClick,
  componentName,
  useEditMode = false,
  onCloseEditMode = null,
  isImageEditActive = false,
  registerEditHandler = null,
  enableKnowledgeSelector = false,
  customEditContent = null,
  // Start mode props
  isStartMode = false,
  startPageDescription = null,
  examplePrompts = [],
  onExamplePromptClick = null,
  contextualTip = null
}, ref) => {
  // Store selectors
  const loading = useFormStateSelector(state => state.loading);
  const success = useFormStateSelector(state => state.success);
  const formErrors = useFormStateSelector(state => state.formErrors);
  const useWebSearchFeatureToggle = useFormStateSelector(state => state.webSearchConfig.enabled);
  const usePrivacyModeToggle = useFormStateSelector(state => state.privacyModeConfig.enabled);
  const useFeatureIcons = useFormStateSelector(state => state.useFeatureIcons);
  const attachedFiles = useFormStateSelector(state => state.attachedFiles);
  const uploadedImage = useFormStateSelector(state => state.uploadedImage);
  const setStoreAttachedFiles = useFormStateSelector(state => state.setAttachedFiles);

  // Privacy mode for ContentSelector (with shallow comparison to prevent unnecessary rerenders)
  const usePrivacyMode = useGeneratorSelectionStore(
    useShallow((state) => state.usePrivacyMode)
  );

  const formContainerClasses = `form-container ${isFormVisible ? 'visible' : ''}`;
  const { isMobileView } = useResponsive();

  // Ref to store latest attachedFiles value (prevents callback recreation)
  const attachedFilesRef = useRef(attachedFiles);
  useEffect(() => {
    attachedFilesRef.current = attachedFiles;
  }, [attachedFiles]);

  // Wrapper for onAttachmentClick that updates store state (stable callback)
  const handleAttachmentClick = useCallback((files) => {
    // Update store state using ref to avoid dependency on attachedFiles
    const newFiles = [...attachedFilesRef.current, ...files];
    setStoreAttachedFiles(newFiles);

    // Call parent callback if provided
    if (onAttachmentClick) {
      onAttachmentClick(files);
    }
  }, [setStoreAttachedFiles, onAttachmentClick]);

  // Wrapper for onRemoveFile that updates store state (stable callback)
  const handleRemoveFile = useCallback((index) => {
    // Update store state using ref to avoid dependency on attachedFiles
    const newFiles = attachedFilesRef.current.filter((_, i) => i !== index);
    setStoreAttachedFiles(newFiles);

    // Call parent callback if provided
    if (onRemoveFile) {
      onRemoveFile(index);
    }
  }, [setStoreAttachedFiles, onRemoveFile]);

  // Drag-and-drop file handling
  const { getRootProps, isDragActive } = useDragDropFiles({
    onFilesAccepted: handleAttachmentClick,
    disabled: !onAttachmentClick
  });

  return (
    <div {...getRootProps()} className="form-section-wrapper">
      {isDragActive && (
        <div className="form-section__drag-overlay">
          <HiUpload className="form-section__drag-overlay-icon" />
          <span className="form-section__drag-overlay-text">Dateien hier ablegen</span>
          <span className="form-section__drag-overlay-hint">PDF, JPG, PNG, WebP</span>
        </div>
      )}
      <div className={`form-section ${formContainerClasses} ${isStartMode ? 'form-section--start-mode' : ''}`} ref={ref}>
        {/* Title and description outside card in start mode */}
        {isStartMode && (title || startPageDescription) && (
          <div className="form-section__start-header">
          {title && <h2 className="form-section__start-title">{title}</h2>}
          {startPageDescription && (
            <p className="form-section__start-description">{startPageDescription}</p>
          )}
        </div>
      )}
      <FormCard
        className={useEditMode ? 'form-card--editmode' : ''}
        variant="elevated"
        size="large"
        hover={false}
        title={useEditMode || isStartMode ? null : title}
        showHideButton={showHideButton}
        onHide={onHide}
        isStartMode={isStartMode}
      >
        <form onSubmit={(e) => {
          e.preventDefault();

          // Check if the submission was triggered by Enter key from react-select
          const activeElement = document.activeElement;

          if (activeElement && (
            activeElement.closest('.react-select') ||
            activeElement.closest('.react-select__input') ||
            activeElement.className?.includes('react-select')
          )) {
            return;
          }

          onSubmit();
        }} className="form-section__form">

          {/* Mobile: firstExtrasChildren above everything (except in start mode or edit mode) */}
          {isMobileView && firstExtrasChildren && !isStartMode && !useEditMode && (
            <div className="form-section__mobile-first-extras">
              {firstExtrasChildren}
            </div>
          )}

          <div className="form-section__container">

            {/* Input Section */}
            <FormInputSection
              isMultiStep={isMultiStep}
              onBack={onBack}
              showBackButton={showBackButton}
              defaultValues={defaultValues}
              validationRules={validationRules}
              useModernForm={useModernForm}
              onFormChange={onFormChange}
              showSubmitButton={useEditMode ? false : (showSubmitButtonInInputSection && showSubmitButton)}
              onSubmit={onSubmit}
              nextButtonText={nextButtonText}
              submitButtonProps={submitButtonProps}
              enablePlatformSelector={!useEditMode && enablePlatformSelector}
              platformOptions={platformOptions}
              platformSelectorLabel={platformSelectorLabel}
              platformSelectorPlaceholder={platformSelectorPlaceholder}
              platformSelectorHelpText={platformSelectorHelpText}
              platformSelectorTabIndex={platformSelectorTabIndex}
              formControl={formControl}
              showImageUpload={showImageUpload}
              onImageChange={onImageChange}
              isStartMode={isStartMode}
            >
              {isImageEditActive ? (
                customEditContent
              ) : useEditMode ? (
                <UniversalEditForm componentName={componentName} onClose={onCloseEditMode} />
              ) : (
                children
              )}
            </FormInputSection>

            {/* Extras Section */}
            {!hideExtrasSection && (isImageEditActive || !useEditMode) && (
              <FormExtrasSection
                interactiveModeToggle={interactiveModeToggle}
                useInteractiveModeToggle={useInteractiveModeToggle}
                onAttachmentClick={handleAttachmentClick}
                onRemoveFile={handleRemoveFile}
                formControl={formControl}
                formNotice={formNotice}
                onSubmit={onSubmit}
                isMultiStep={isMultiStep}
                nextButtonText={nextButtonText}
                submitButtonProps={submitButtonProps}
                showSubmitButton={(useEditMode ? false : (showSubmitButton && !showSubmitButtonInInputSection))}
                firstExtrasChildren={(!isMobileView || isStartMode) && !useEditMode ? firstExtrasChildren : null}
                featureIconsTabIndex={featureIconsTabIndex}
                knowledgeSelectorTabIndex={knowledgeSelectorTabIndex}
                knowledgeSourceSelectorTabIndex={knowledgeSourceSelectorTabIndex}
                documentSelectorTabIndex={documentSelectorTabIndex}
                submitButtonTabIndex={submitButtonTabIndex}
                showProfileSelector={showProfileSelector}
                onPrivacyInfoClick={onPrivacyInfoClick}
                onWebSearchInfoClick={onWebSearchInfoClick}
                componentName={componentName}
                enableKnowledgeSelector={enableKnowledgeSelector}
                attachedFiles={attachedFiles}
                usePrivacyMode={usePrivacyMode}
                isStartMode={isStartMode}
              >
                {extrasChildren}
              </FormExtrasSection>
            )}

          </div>
          {bottomSectionChildren && (
            <div className="form-section__bottom">
              {bottomSectionChildren}
            </div>
          )}
        </form>
      </FormCard>

      {/* Example Prompts - shown in start mode */}
      {isStartMode && examplePrompts.length > 0 && (
        <ExamplePrompts
          prompts={examplePrompts}
          onPromptClick={onExamplePromptClick}
        />
      )}

      {/* Contextual tip - shown below example prompts */}
      {contextualTip && <InputTip tip={contextualTip} />}
      </div>
    </div>
  );
});

FormSection.displayName = 'FormSection';

export default React.memo(FormSection);
