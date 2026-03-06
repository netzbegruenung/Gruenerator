import React, { useCallback, memo, type ReactNode } from 'react';
import { FiSend } from 'react-icons/fi';

import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import FeatureIcons from '../../FeatureIcons';
import FeatureToggle from '../../FeatureToggle';
import SubmitButton from '../../SubmitButton';
import useResponsive from '../hooks/useResponsive';

import ExamplePrompts from './ExamplePrompts';

import type { AttachedFile } from '../../ContentSelector';
import type {
  FormExtrasSectionProps,
  FeatureToggle as FeatureToggleType,
  TabIndexConfig,
  ExamplePrompt,
} from '@/types/baseform';

import { cn } from '@/utils/cn';

interface FeatureIconsTabIndex {
  webSearch?: number;
  balancedMode?: number;
  attachment?: number;
}

interface ExtendedFormExtrasSectionProps extends FormExtrasSectionProps {
  loading?: boolean;
  success?: boolean;
  useFeatureIcons?: boolean;
  showAgentMode?: boolean;
}

const FormExtrasSection: React.FC<ExtendedFormExtrasSectionProps> = ({
  balancedModeToggle,
  interactiveModeToggle,
  useInteractiveModeToggle,
  onAttachmentClick,
  onRemoveFile,
  formControl = null,
  formNotice = null,
  onSubmit,
  isMultiStep = false,
  nextButtonText = null,
  submitButtonProps = {},
  showSubmitButton = true,
  children,
  firstExtrasChildren = null,
  featureIconsTabIndex = {
    webSearch: 11,
    balancedMode: 12,
    attachment: 13,
  } as FeatureIconsTabIndex,
  submitButtonTabIndex = 17,
  onPrivacyInfoClick,
  onWebSearchInfoClick,
  componentName = 'default',
  hide = false,
  attachedFiles = [],
  usePrivacyMode = false,
  isStartMode = false,
  examplePrompts = [],
  onExamplePromptClick = null,
  selectedPlatforms = [],
  isStreaming = false,
  streamingMessage,
  onAbort,
  // Props previously from store
  loading,
  success,
  useFeatureIcons = false,
  showAgentMode = false,
}) => {
  const { isMobileView } = useResponsive();

  const currentGeneratedContent = useGeneratedTextStore(
    (state) => state.generatedTexts[componentName] || ''
  );

  const handleInteractiveModeClick = useCallback((): void => {
    if (interactiveModeToggle && interactiveModeToggle.onToggle) {
      interactiveModeToggle.onToggle(!interactiveModeToggle.isActive);
    }
  }, [interactiveModeToggle]);

  const handleBalancedModeClick = useCallback(() => {
    balancedModeToggle?.onToggle?.(!balancedModeToggle.isActive);
  }, [balancedModeToggle]);

  const handleRemoveFile = useCallback(() => {
    onRemoveFile?.(0);
  }, [onRemoveFile]);

  if (hide) {
    return null;
  }

  const hasExtras =
    useInteractiveModeToggle ||
    formNotice ||
    showSubmitButton ||
    children ||
    firstExtrasChildren ||
    true;

  if (!hasExtras) {
    return null;
  }

  const handleInteractiveMode =
    interactiveModeToggle && useInteractiveModeToggle ? handleInteractiveModeClick : undefined;

  const finalAttachedFiles = attachedFiles as AttachedFile[];

  return (
    <div
      className={cn(
        'form-section__extras flex-1 min-w-0 rounded-sm self-start max-md:self-stretch',
        isStartMode && 'form-section__extras--start-mode self-stretch flex-none w-full pt-sm mt-0'
      )}
    >
      <div className="form-extras__content flex flex-col gap-md">
        {isStartMode ? (
          <div className="flex items-center justify-between w-full gap-sm px-xs">
            <div className="flex items-center gap-sm flex-1 min-w-0">
              {useFeatureIcons && (
                <FeatureIcons
                  onBalancedModeClick={balancedModeToggle ? handleBalancedModeClick : undefined}
                  onAttachmentClick={onAttachmentClick}
                  onRemoveFile={handleRemoveFile}
                  onInteractiveModeClick={handleInteractiveMode}
                  interactiveModeActive={
                    interactiveModeToggle ? interactiveModeToggle.isActive : false
                  }
                  attachedFiles={finalAttachedFiles}
                  className="w-auto gap-0"
                  tabIndex={featureIconsTabIndex}
                  onPrivacyInfoClick={onPrivacyInfoClick}
                  onWebSearchInfoClick={onWebSearchInfoClick}
                  noBorder={true}
                  hideLoginPrompt={true}
                  showAgentMode={showAgentMode}
                />
              )}
              {examplePrompts.length > 0 && (
                <div className="flex items-center max-md:hidden">
                  <ExamplePrompts
                    prompts={examplePrompts}
                    onPromptClick={onExamplePromptClick}
                    selectedPlatforms={selectedPlatforms}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-xs shrink-0">
              {showSubmitButton && (
                <SubmitButton
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    onSubmit?.();
                  }}
                  loading={loading}
                  success={success}
                  text={
                    isMultiStep
                      ? nextButtonText || 'Weiter'
                      : (submitButtonProps as Record<string, string>)?.defaultText || 'Grünerieren'
                  }
                  icon={<FiSend />}
                  iconOnly={true}
                  className="size-11 min-w-11 rounded-full p-0 flex items-center justify-center btn-icon btn-primary"
                  ariaLabel={isMultiStep ? nextButtonText || 'Weiter' : 'Generieren'}
                  type="submit"
                  tabIndex={submitButtonTabIndex}
                  isStreaming={isStreaming}
                  streamingMessage={streamingMessage}
                  onAbort={onAbort}
                  {...submitButtonProps}
                />
              )}
            </div>
          </div>
        ) : (
          <>
            {firstExtrasChildren && (
              <div className="[&>*:not(:last-child)]:mb-md">{firstExtrasChildren}</div>
            )}

            {useFeatureIcons && (
              <div>
                <FeatureIcons
                  onBalancedModeClick={balancedModeToggle ? handleBalancedModeClick : undefined}
                  onAttachmentClick={onAttachmentClick}
                  onRemoveFile={handleRemoveFile}
                  onInteractiveModeClick={handleInteractiveMode}
                  interactiveModeActive={
                    interactiveModeToggle ? interactiveModeToggle.isActive : false
                  }
                  attachedFiles={finalAttachedFiles}
                  className="animate-in fade-in duration-200"
                  tabIndex={featureIconsTabIndex}
                  onPrivacyInfoClick={onPrivacyInfoClick}
                  onWebSearchInfoClick={onWebSearchInfoClick}
                  noBorder={false}
                  showAgentMode={showAgentMode}
                />
              </div>
            )}

            {formNotice && <div className="rounded-sm">{formNotice}</div>}

            {!useFeatureIcons && interactiveModeToggle && useInteractiveModeToggle && (
              <div>
                <FeatureToggle
                  isActive={interactiveModeToggle.isActive}
                  onToggle={interactiveModeToggle.onToggle}
                  label={interactiveModeToggle.label}
                  icon={interactiveModeToggle.icon as React.ComponentType}
                  description={interactiveModeToggle.description}
                  className="form-feature-toggle"
                />
              </div>
            )}

            {children && <div className="p-0">{children}</div>}

            {showSubmitButton && (
              <div className="p-0 mt-md">
                <SubmitButton
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    onSubmit?.();
                  }}
                  loading={loading}
                  success={success}
                  text={
                    isMultiStep
                      ? nextButtonText || 'Weiter'
                      : (submitButtonProps as Record<string, string>)?.defaultText || 'Grünerieren'
                  }
                  className="w-full button-primary"
                  ariaLabel={isMultiStep ? nextButtonText || 'Weiter' : 'Generieren'}
                  type="submit"
                  tabIndex={submitButtonTabIndex}
                  isStreaming={isStreaming}
                  streamingMessage={streamingMessage}
                  onAbort={onAbort}
                  {...submitButtonProps}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

FormExtrasSection.displayName = 'FormExtrasSection';

export default memo(FormExtrasSection);
