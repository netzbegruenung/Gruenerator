import React, { forwardRef, useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useShallow } from 'zustand/react/shallow';
import FormCard from './FormCard';
import FormInputSection from './FormInputSection';
import FormExtrasSection from './FormExtrasSection';
import ExamplePrompts from './ExamplePrompts';
import InputTip from '../Input/InputTip';
import useResponsive from '../hooks/useResponsive';
import UniversalEditForm from '../EditMode/UniversalEditForm';
import { useFormStateSelector } from '../FormStateProvider';
import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';

/**
 * Hauptkomponente für den Formular-Container (Inputs + Extras)
 * @param {Object} props - Komponenten-Props
 * @param {string} props.title - Titel des Formulars
 * @param {Function} props.onSubmit - Funktion für die Formularübermittlung
 * @param {boolean} props.loading - Ladeindikator
 * @param {boolean} props.success - Erfolgsindikator
 * @param {Object} props.formErrors - Formularfehler
 * @param {boolean} props.isFormVisible - Ist das Formular sichtbar
 * @param {boolean} props.isMultiStep - Ist es ein mehrstufiges Formular
 * @param {Function} props.onBack - Funktion für den Zurück-Button
 * @param {boolean} props.showBackButton - Soll der Zurück-Button angezeigt werden
 * @param {string} props.nextButtonText - Text für den Weiter-Button
 * @param {Object} props.submitButtonProps - Props für den Submit-Button
 * @param {Object} props.webSearchFeatureToggle - Props für den Web Search Feature-Toggle
 * @param {boolean} props.useWebSearchFeatureToggle - Soll der Web Search Feature-Toggle verwendet werden
 * @param {Object} props.privacyModeToggle - Props für den Privacy-Mode Feature-Toggle
 * @param {boolean} props.usePrivacyModeToggle - Soll der Privacy-Mode Feature-Toggle verwendet werden
 * @param {boolean} props.enablePlatformSelector - Soll der Platform Selector aktiviert werden
 * @param {Array} props.platformOptions - Optionen für Platform Selector
 * @param {Object} props.formControl - React Hook Form Control Object
 * @param {node} props.children - Input-Elemente für das Formular
 * @param {boolean} props.showSubmitButton - Soll der Submit-Button angezeigt werden
 * @param {node} props.formNotice - Hinweis oder Information im Formular
 * @param {node} props.extrasChildren - Zusätzliche Extras-Komponenten
 * @param {Object} props.defaultValues - Default-Werte für react-hook-form
 * @param {Object} props.validationRules - Validierungsregeln für Legacy-Support
 * @param {boolean} props.useModernForm - Aktiviert react-hook-form (opt-in)
 * @param {Function} props.onFormChange - Callback für Formular-Änderungen
 * @param {node} props.bottomSectionChildren - Zusätzliche Unterelemente am Ende des Formulars
 * @param {boolean} props.showHideButton - Zeige Verstecken-Button
 * @param {Function} props.onHide - Callback für Verstecken-Button
 * @param {node} props.firstExtrasChildren - Zusätzliche Extras-Komponenten am Anfang des Formulars
 * @param {boolean} props.hideExtrasSection - Verstecke die Extras-Sektion komplett
 * @param {boolean} props.showSubmitButtonInInputSection - Zeige Submit-Button in der Input-Sektion statt Extras-Sektion
 * @param {boolean} props.showProfileSelector - Zeige Profile Selector in KnowledgeSelector
 * @returns {JSX.Element} Formular-Sektion
 */
const FormSection = forwardRef(({
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

  return (
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
          
          {/* Mobile: firstExtrasChildren above everything (except in start mode where it goes in extras section) */}
          {isMobileView && firstExtrasChildren && !isStartMode && (
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
                <UniversalEditForm componentName={componentName} />
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
  );
});

FormSection.propTypes = {
  title: PropTypes.string,
  onSubmit: PropTypes.func.isRequired,
  isFormVisible: PropTypes.bool.isRequired,
  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  submitButtonProps: PropTypes.shape({
    statusMessage: PropTypes.string,
    showStatus: PropTypes.bool,
    defaultText: PropTypes.string
  }),
  // Feature toggle props removed - web search, privacy, and pro mode now use store
  interactiveModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string
  }),
  useInteractiveModeToggle: PropTypes.bool,
  enableKnowledgeSelector: PropTypes.bool,
  enableDocumentSelector: PropTypes.bool,
  enablePlatformSelector: PropTypes.bool,
  platformOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired
    })
  ),
  platformSelectorLabel: PropTypes.string,
  platformSelectorPlaceholder: PropTypes.string,
  platformSelectorHelpText: PropTypes.string,
  formControl: PropTypes.object,
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  showSubmitButton: PropTypes.bool,
  formNotice: PropTypes.node,
  extrasChildren: PropTypes.node,
  defaultValues: PropTypes.object,
  validationRules: PropTypes.object,
  useModernForm: PropTypes.bool,
  onFormChange: PropTypes.func,
  bottomSectionChildren: PropTypes.node,
  showHideButton: PropTypes.bool,
  onHide: PropTypes.func,
  firstExtrasChildren: PropTypes.node,
  hideExtrasSection: PropTypes.bool,
  showSubmitButtonInInputSection: PropTypes.bool,
  platformSelectorTabIndex: PropTypes.number,
  knowledgeSelectorTabIndex: PropTypes.number,
  knowledgeSourceSelectorTabIndex: PropTypes.number,
  documentSelectorTabIndex: PropTypes.number,
  submitButtonTabIndex: PropTypes.number,
  useEditMode: PropTypes.bool,
  isStartMode: PropTypes.bool,
  startPageDescription: PropTypes.string,
  examplePrompts: PropTypes.arrayOf(PropTypes.shape({
    icon: PropTypes.string,
    text: PropTypes.string.isRequired
  })),
  onExamplePromptClick: PropTypes.func,
  contextualTip: PropTypes.shape({
    icon: PropTypes.string,
    text: PropTypes.string.isRequired
  })
};

FormSection.defaultProps = {
  isMultiStep: false,
  showBackButton: false,
  enableKnowledgeSelector: false,
  enableDocumentSelector: false,
  enablePlatformSelector: false,
  platformOptions: [],
  platformSelectorLabel: undefined,
  platformSelectorPlaceholder: undefined,
  platformSelectorHelpText: undefined,
  formControl: null,
  showSubmitButton: true,
  formNotice: null,
  extrasChildren: null,
  defaultValues: {},
  validationRules: {},
  useModernForm: true,
  onFormChange: null,
  bottomSectionChildren: null,
  showHideButton: false,
  onHide: null,
  firstExtrasChildren: null,
  hideExtrasSection: false,
  showSubmitButtonInInputSection: false,
  platformSelectorTabIndex: 12,
  knowledgeSelectorTabIndex: 14,
  submitButtonTabIndex: 17,
  useEditMode: false,
  isStartMode: false,
  examplePrompts: [],
  onExamplePromptClick: null,
  contextualTip: null
};

FormSection.propTypes.onPrivacyInfoClick = PropTypes.func;
FormSection.propTypes.componentName = PropTypes.string;

FormSection.displayName = 'FormSection';

export default React.memo(FormSection); 
