import React, { forwardRef, type ReactNode } from 'react';
import { HiUpload, HiX } from 'react-icons/hi';
import { useShallow } from 'zustand/react/shallow';

import useDragDropFiles from '../../../../hooks/useDragDropFiles';
import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';
import HelpIconPopover from '../../HelpIconPopover';
import { useBaseFormContext } from '../BaseFormContext';
import useResponsive from '../hooks/useResponsive';
import InputTip from '../Input/InputTip';

import ExamplePrompts from './ExamplePrompts';
import FormExtrasSection from './FormExtrasSection';
import FormInputSection from './FormInputSection';

import type {
  FeatureToggle,
  PlatformOption,
  ExamplePrompt,
  ContextualTip,
  FormControl,
  HelpContent,
} from '@/types/baseform';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/cn';

interface FormSectionProps {
  title?: string | React.ReactNode;
  subtitle?: string;
  onSubmit?: ((data?: Record<string, unknown>) => void | Promise<void>) | (() => void);
  isFormVisible: boolean;
  isMultiStep?: boolean;
  onBack?: () => void;
  showBackButton?: boolean;
  nextButtonText?: string;
  submitButtonProps?: Record<string, unknown>;
  interactiveModeToggle?: FeatureToggle | null;
  useInteractiveModeToggle?: boolean;
  onAttachmentClick?: ((files: File[]) => void) | ((files?: File[]) => void);
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
  showProfileSelector?: boolean;
  showImageUpload?: boolean;
  uploadedImage?: unknown;
  onImageChange?: ((image: unknown) => void) | null;
  onPrivacyInfoClick?: () => void;
  onWebSearchInfoClick?: () => void;
  componentName?: string;
  isImageEditActive?: boolean;
  enableKnowledgeSelector?: boolean;
  customEditContent?: ReactNode;
  isStartMode?: boolean;
  startPageDescription?: string | null;
  examplePrompts?: ExamplePrompt[];
  onExamplePromptClick?: ((prompt: ExamplePrompt) => void) | null;
  contextualTip?: ContextualTip | null;
  selectedPlatforms?: string[];
  inputHeaderContent?: ReactNode;
  hideInputSection?: boolean;
  helpContent?: HelpContent | null;
  isStreaming?: boolean;
  streamingMessage?: string;
  onAbort?: () => void;
  loading?: boolean;
  success?: boolean;
  useFeatureIcons?: boolean;
  showAgentMode?: boolean;
  attachedFiles?: unknown[];
}

const FormSection = forwardRef<HTMLDivElement, FormSectionProps>(
  (
    {
      title,
      subtitle,
      onSubmit,
      isFormVisible,
      isMultiStep,
      onBack,
      showBackButton,
      nextButtonText,
      submitButtonProps = {},
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
      showProfileSelector = true,
      showImageUpload = false,
      onImageChange = null,
      onPrivacyInfoClick,
      onWebSearchInfoClick,
      componentName,
      isImageEditActive = false,
      enableKnowledgeSelector = false,
      customEditContent = null,
      isStartMode = false,
      startPageDescription = null,
      examplePrompts = [],
      onExamplePromptClick = null,
      contextualTip = null,
      selectedPlatforms = [],
      inputHeaderContent = null,
      hideInputSection = false,
      helpContent = null,
      isStreaming = false,
      streamingMessage,
      onAbort,
      loading = false,
      success = false,
      useFeatureIcons = false,
      showAgentMode = false,
      attachedFiles = [],
    },
    ref
  ) => {
    const usePrivacyMode = useGeneratorSelectionStore(useShallow((state) => state.usePrivacyMode));

    const { isMobileView } = useResponsive();
    const { hasContent } = useBaseFormContext();

    const { getRootProps, isDragActive } = useDragDropFiles({
      onFilesAccepted: onAttachmentClick as (files: File[]) => void,
      disabled: !onAttachmentClick,
    });

    return (
      <div {...getRootProps()} className="@container/form-section relative">
        {isDragActive && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-[4px] border-2 border-dashed border-[var(--klee)] rounded-md flex flex-col items-center justify-center gap-sm z-[100] animate-in fade-in duration-150">
            <HiUpload className="text-5xl text-[var(--klee)] animate-bounce-gentle" />
            <span className="text-white text-[1.1rem] font-medium">Dateien hier ablegen</span>
            <span className="text-disabled text-[0.85rem]">PDF, JPG, PNG, WebP</span>
          </div>
        )}
        <div
          className={cn(
            'form-section flex flex-col min-h-[400px] bg-[var(--card-background)] text-foreground',
            'max-md:min-h-[300px] max-md:mt-md',
            hasContent && 'max-md:mt-xs',
            isStartMode && 'form-section--start-mode min-h-0',
            'xl:min-h-[450px] 3xl:min-h-[480px] 4xl:min-h-[520px] 5xl:min-h-[580px]',
            isStartMode && 'xl:min-h-0 3xl:min-h-0 4xl:min-h-0 5xl:min-h-0'
          )}
          ref={ref}
        >
          {isStartMode && (title || startPageDescription) && (
            <div className="text-left mb-md">
              {title && <h2 className="text-left text-[1.5rem] font-semibold mb-sm">{title}</h2>}
              {startPageDescription && (
                <p className="text-base leading-[1.5] max-w-full">{startPageDescription}</p>
              )}
            </div>
          )}

          <Card
            className={cn(
              'overflow-hidden shadow-card-elevated transition-all duration-250 flex flex-col',
              isStartMode && 'rounded-3xl shadow-md border-[var(--border-subtle)]',
              !isStartMode && 'rounded-md',
              isStartMode &&
                'max-[480px]:rounded-t-2xl max-[480px]:rounded-b-none max-[480px]:border-b-0',
              'forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace]'
            )}
          >
            {!isStartMode && title && (
              <CardHeader
                className={cn(
                  'flex-row justify-between items-center border-b border-grey-200 dark:border-grey-700 py-md px-xl max-md:px-md max-md:py-md',
                  hasContent && 'pt-lg'
                )}
              >
                <div>
                  <CardTitle className="text-[1.4em]">{title}</CardTitle>
                  {subtitle && (
                    <p className="text-[0.65em] font-normal opacity-70 mt-xxs">{subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-xs">
                  <HelpIconPopover helpContent={helpContent} />
                  {showHideButton && onHide && (
                    <button
                      type="button"
                      onClick={onHide}
                      className="bg-transparent border-none text-foreground cursor-pointer p-xxs rounded-sm flex items-center justify-center text-[1.2em] opacity-60 transition-all hover:opacity-100 hover:bg-background-alt hover:scale-[1.01] focus:outline-2 focus:outline-accent focus:outline-offset-2"
                      aria-label="Formular verstecken"
                      title="Formular verstecken"
                    >
                      <HiX />
                    </button>
                  )}
                </div>
              </CardHeader>
            )}
            <CardContent
              className={cn(
                'flex-1 flex flex-col',
                isStartMode ? 'p-md max-md:p-sm' : 'p-lg max-md:p-md max-[480px]:p-sm'
              )}
            >
              <form
                onSubmit={(e: React.FormEvent) => {
                  e.preventDefault();

                  const activeElement = document.activeElement;

                  if (
                    activeElement &&
                    (activeElement.closest('.react-select') ||
                      activeElement.closest('.react-select__input') ||
                      activeElement.className?.includes('react-select'))
                  ) {
                    return;
                  }

                  onSubmit?.();
                }}
                className="flex flex-col h-full"
              >
                {isMobileView && firstExtrasChildren && !isStartMode && (
                  <div className="hidden max-md:block mb-lg [&>*:not(:last-child)]:mb-md">
                    {firstExtrasChildren}
                  </div>
                )}

                <div
                  className={cn(
                    'form-section__container flex gap-lg h-full',
                    'max-md:flex-col max-md:gap-0',
                    isStartMode && 'flex-col gap-xs',
                    hasContent && !isStartMode && 'flex-col',
                    'xl:gap-[calc(var(--spacing-responsive-large)*1.2)]',
                    '4xl:gap-[calc(var(--spacing-responsive-large)*1.4)]'
                  )}
                >
                  {!hideInputSection && (
                    <FormInputSection
                      isMultiStep={isMultiStep}
                      onBack={onBack}
                      showBackButton={showBackButton}
                      defaultValues={defaultValues}
                      validationRules={validationRules}
                      useModernForm={useModernForm}
                      onFormChange={onFormChange}
                      showSubmitButton={showSubmitButtonInInputSection && showSubmitButton}
                      onSubmit={onSubmit}
                      nextButtonText={nextButtonText}
                      submitButtonProps={submitButtonProps}
                      enablePlatformSelector={enablePlatformSelector}
                      platformOptions={platformOptions}
                      platformSelectorLabel={platformSelectorLabel}
                      platformSelectorPlaceholder={platformSelectorPlaceholder}
                      platformSelectorHelpText={platformSelectorHelpText}
                      formControl={formControl}
                      showImageUpload={showImageUpload}
                      onImageChange={onImageChange}
                      isStartMode={isStartMode}
                      inputHeaderContent={inputHeaderContent}
                    >
                      {isImageEditActive ? customEditContent : children}
                    </FormInputSection>
                  )}

                  {!hideExtrasSection && !hideInputSection && (
                    <FormExtrasSection
                      interactiveModeToggle={interactiveModeToggle ?? null}
                      useInteractiveModeToggle={useInteractiveModeToggle}
                      onAttachmentClick={onAttachmentClick as (files: File[]) => void}
                      onRemoveFile={onRemoveFile}
                      formControl={formControl}
                      formNotice={formNotice}
                      onSubmit={onSubmit}
                      isMultiStep={isMultiStep}
                      nextButtonText={nextButtonText}
                      submitButtonProps={submitButtonProps}
                      showSubmitButton={showSubmitButton && !showSubmitButtonInInputSection}
                      firstExtrasChildren={
                        !isMobileView || isStartMode ? firstExtrasChildren : null
                      }
                      showProfileSelector={showProfileSelector}
                      onPrivacyInfoClick={onPrivacyInfoClick}
                      onWebSearchInfoClick={onWebSearchInfoClick}
                      componentName={componentName}
                      enableKnowledgeSelector={enableKnowledgeSelector}
                      attachedFiles={attachedFiles}
                      usePrivacyMode={usePrivacyMode}
                      isStartMode={isStartMode}
                      examplePrompts={isStartMode ? examplePrompts : []}
                      onExamplePromptClick={onExamplePromptClick}
                      selectedPlatforms={selectedPlatforms}
                      isStreaming={isStreaming}
                      streamingMessage={streamingMessage}
                      onAbort={onAbort}
                      loading={loading}
                      success={success}
                      useFeatureIcons={useFeatureIcons}
                      showAgentMode={showAgentMode}
                    >
                      {extrasChildren}
                    </FormExtrasSection>
                  )}
                </div>
                {bottomSectionChildren && (
                  <div className="form-section__bottom border-t border-grey-200 dark:border-grey-700 pt-md pb-sm mt-sm [&_h3]:mt-0">
                    {bottomSectionChildren}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {contextualTip && (
            <InputTip
              tip={{
                text: contextualTip.text,
                icon: typeof contextualTip.icon === 'string' ? contextualTip.icon : undefined,
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

FormSection.displayName = 'FormSection';

export default React.memo(FormSection);
