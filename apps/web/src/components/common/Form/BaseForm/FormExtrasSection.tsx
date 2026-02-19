import React, { useCallback, memo, ReactNode } from 'react';
import { FiSend } from 'react-icons/fi';

import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import FeatureIcons from '../../FeatureIcons';
import FeatureToggle from '../../FeatureToggle';
import SubmitButton from '../../SubmitButton';
import { useFormStateSelector } from '../FormStateProvider';
import useResponsive from '../hooks/useResponsive';

import ExamplePrompts from './ExamplePrompts';

import type { AttachedFile } from '../../ContentSelector';
import type {
  FormExtrasSectionProps,
  FeatureToggle as FeatureToggleType,
  TabIndexConfig,
  ExamplePrompt,
} from '@/types/baseform';
import '../../../../assets/styles/components/ui/FormExtras.css';

interface FeatureIconsTabIndex {
  webSearch?: number;
  balancedMode?: number;
  attachment?: number;
}

const FormExtrasSection: React.FC<FormExtrasSectionProps> = ({
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
}) => {
  const { isMobileView } = useResponsive();

  const loading = useFormStateSelector((state) => state.loading) ?? undefined;
  const success = useFormStateSelector((state) => state.success) ?? undefined;
  const useInteractiveModeToggleStore = useFormStateSelector(
    (state) => state.interactiveModeConfig?.enabled || false
  );
  const useFeatureIcons = useFormStateSelector((state) => state.useFeatureIcons);
  const storeAttachedFiles = useFormStateSelector((state) => state.attachedFiles) as AttachedFile[];

  const finalAttachedFiles = (
    attachedFiles.length > 0 ? attachedFiles : storeAttachedFiles
  ) as AttachedFile[];

  const currentGeneratedContent = useGeneratedTextStore(
    (state) => state.generatedTexts[componentName] || ''
  );

  const handleInteractiveModeClick = useCallback((): void => {
    if (interactiveModeToggle && interactiveModeToggle.onToggle) {
      interactiveModeToggle.onToggle(!interactiveModeToggle.isActive);
    }
  }, [interactiveModeToggle]);

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

  const handleBalancedModeClick = balancedModeToggle
    ? () => balancedModeToggle.onToggle?.(!balancedModeToggle.isActive)
    : undefined;

  const handleInteractiveMode =
    interactiveModeToggle && useInteractiveModeToggleStore ? handleInteractiveModeClick : undefined;

  return (
    <div
      className={`form-section__extras ${isStartMode ? 'form-section__extras--start-mode' : ''}`}
    >
      <div className="form-extras__content">
        {isStartMode ? (
          <>
            <div className="form-extras__row">
              <div className="form-extras__left">
                {useFeatureIcons && (
                  <FeatureIcons
                    onBalancedModeClick={handleBalancedModeClick}
                    onAttachmentClick={onAttachmentClick}
                    onRemoveFile={() => onRemoveFile?.(0)}
                    onInteractiveModeClick={handleInteractiveMode}
                    interactiveModeActive={
                      interactiveModeToggle ? interactiveModeToggle.isActive : false
                    }
                    attachedFiles={finalAttachedFiles}
                    className="form-extras__feature-icons"
                    tabIndex={featureIconsTabIndex}
                    onPrivacyInfoClick={onPrivacyInfoClick}
                    onWebSearchInfoClick={onWebSearchInfoClick}
                    noBorder={true}
                    hideLoginPrompt={true}
                  />
                )}
                {examplePrompts.length > 0 && (
                  <div className="form-extras__examples">
                    <ExamplePrompts
                      prompts={examplePrompts}
                      onPromptClick={onExamplePromptClick}
                      selectedPlatforms={selectedPlatforms}
                    />
                  </div>
                )}
              </div>
              <div className="form-extras__right">
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
                        : (submitButtonProps as Record<string, string>)?.defaultText ||
                          'Grünerieren'
                    }
                    icon={<FiSend />}
                    iconOnly={true}
                    className="form-extras__submit-button btn-icon btn-primary"
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
          </>
        ) : (
          <>
            {firstExtrasChildren && (
              <div className="form-extras__item form-extras__first">{firstExtrasChildren}</div>
            )}

            {useFeatureIcons && (
              <div className="form-extras__item">
                <FeatureIcons
                  onBalancedModeClick={handleBalancedModeClick}
                  onAttachmentClick={onAttachmentClick}
                  onRemoveFile={() => onRemoveFile?.(0)}
                  onInteractiveModeClick={handleInteractiveMode}
                  interactiveModeActive={
                    interactiveModeToggle ? interactiveModeToggle.isActive : false
                  }
                  attachedFiles={finalAttachedFiles}
                  className="form-extras__feature-icons"
                  tabIndex={featureIconsTabIndex}
                  onPrivacyInfoClick={onPrivacyInfoClick}
                  onWebSearchInfoClick={onWebSearchInfoClick}
                  noBorder={false}
                />
              </div>
            )}

            {formNotice && (
              <div className="form-extras__item form-extras__notice">{formNotice}</div>
            )}

            {!useFeatureIcons && interactiveModeToggle && useInteractiveModeToggle && (
              <div className="form-extras__item">
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

            {children && <div className="form-extras__item form-extras__custom">{children}</div>}

            {showSubmitButton && (
              <div className="form-extras__item form-extras__submit">
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
                  className="form-extras__submit-button button-primary"
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
