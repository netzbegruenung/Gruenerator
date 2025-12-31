import React, { useCallback, memo, ReactNode } from 'react';
import { FiSend } from 'react-icons/fi';
import FeatureToggle from '../../FeatureToggle';
import FeatureIcons from '../../FeatureIcons';
import SubmitButton from '../../SubmitButton';
import useResponsive from '../hooks/useResponsive';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { useFormStateSelector } from '../FormStateProvider';
import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';
import type { FormExtrasSectionProps, FeatureToggle as FeatureToggleType, TabIndexConfig } from '@/types/baseform';
import '../../../../assets/styles/components/ui/FormExtras.css';

interface FeatureIconsTabIndex {
  webSearch?: number;
  balancedMode?: number;
  attachment?: number;
  anweisungen?: number;
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
    anweisungen: 14
  } as FeatureIconsTabIndex,
  submitButtonTabIndex = 17,
  onPrivacyInfoClick,
  onWebSearchInfoClick,
  componentName = 'default',
  hide = false,
  attachedFiles = [],
  usePrivacyMode = false,
  isStartMode = false
}) => {
  const { isMobileView } = useResponsive();

  const loading = useFormStateSelector(state => state.loading);
  const success = useFormStateSelector(state => state.success);
  const useInteractiveModeToggleStore = useFormStateSelector(state => state.interactiveModeConfig?.enabled || false);
  const useFeatureIcons = useFormStateSelector(state => state.useFeatureIcons);
  const storeAttachedFiles = useFormStateSelector(state => state.attachedFiles);

  const finalAttachedFiles = attachedFiles.length > 0 ? attachedFiles : storeAttachedFiles;

  const currentGeneratedContent = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');

  const source = useGeneratorSelectionStore(state => state.source);
  const setSource = useGeneratorSelectionStore(state => state.setSource);
  const anweisungenActive = source.type === 'user';

  const handleAnweisungenClick = useCallback((): void => {
    if (source.type === 'user') {
      setSource({ type: 'neutral', id: null, name: null });
    } else {
      setSource({ type: 'user', id: null, name: 'Meine Anweisungen' });
    }
  }, [source.type, setSource]);

  const handleInteractiveModeClick = useCallback((): void => {
    if (interactiveModeToggle && interactiveModeToggle.onToggle) {
      interactiveModeToggle.onToggle(!interactiveModeToggle.isActive);
    }
  }, [interactiveModeToggle]);

  if (hide) {
    return null;
  }

  const hasExtras = useInteractiveModeToggle ||
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

  const handleInteractiveMode = interactiveModeToggle && useInteractiveModeToggleStore
    ? handleInteractiveModeClick
    : undefined;

  return (
    <div className={`form-section__extras ${isStartMode ? 'form-section__extras--start-mode' : ''}`}>
      <div className="form-extras__content">

        {isStartMode ? (
          <>
            <div className="form-extras__row">
              <div className="form-extras__left">
                {useFeatureIcons && (
                  <FeatureIcons
                    onBalancedModeClick={handleBalancedModeClick}
                    onAttachmentClick={onAttachmentClick}
                    onRemoveFile={onRemoveFile}
                    onAnweisungenClick={handleAnweisungenClick}
                    onInteractiveModeClick={handleInteractiveMode}
                    anweisungenActive={anweisungenActive}
                    interactiveModeActive={interactiveModeToggle ? interactiveModeToggle.isActive : false}
                    attachedFiles={finalAttachedFiles}
                    className="form-extras__feature-icons"
                    tabIndex={featureIconsTabIndex}
                    onPrivacyInfoClick={onPrivacyInfoClick}
                    onWebSearchInfoClick={onWebSearchInfoClick}
                    noBorder={true}
                    hideLoginPrompt={true}
                  />
                )}
              </div>
              <div className="form-extras__right">
                {firstExtrasChildren}
                {showSubmitButton && (
                  <SubmitButton
                    onClick={onSubmit}
                    loading={loading}
                    success={success}
                    text={isMultiStep ? (nextButtonText || 'Weiter') : ((submitButtonProps as Record<string, string>)?.defaultText || "Grünerieren")}
                    icon={isMobileView ? <FiSend /> : null}
                    iconOnly={isMobileView}
                    className={`form-extras__submit-button ${isMobileView ? 'btn-icon btn-primary' : 'button-primary'}`}
                    ariaLabel={isMultiStep ? (nextButtonText || 'Weiter') : "Generieren"}
                    type="submit"
                    tabIndex={submitButtonTabIndex}
                    {...submitButtonProps}
                  />
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {firstExtrasChildren && (
              <div className="form-extras__item form-extras__first">
                {firstExtrasChildren}
              </div>
            )}

            {useFeatureIcons && (
              <div className="form-extras__item">
                <FeatureIcons
                  onBalancedModeClick={handleBalancedModeClick}
                  onAttachmentClick={onAttachmentClick}
                  onRemoveFile={onRemoveFile}
                  onAnweisungenClick={handleAnweisungenClick}
                  onInteractiveModeClick={handleInteractiveMode}
                  anweisungenActive={anweisungenActive}
                  interactiveModeActive={interactiveModeToggle ? interactiveModeToggle.isActive : false}
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
              <div className="form-extras__item form-extras__notice">
                {formNotice}
              </div>
            )}

            {!useFeatureIcons && interactiveModeToggle && useInteractiveModeToggle && (
              <div className="form-extras__item">
                <FeatureToggle {...interactiveModeToggle} className="form-feature-toggle" />
              </div>
            )}

            {children && (
              <div className="form-extras__item form-extras__custom">
                {children}
              </div>
            )}

            {showSubmitButton && (
              <div className="form-extras__item form-extras__submit">
                <SubmitButton
                  onClick={onSubmit}
                  loading={loading}
                  success={success}
                  text={isMultiStep ? (nextButtonText || 'Weiter') : ((submitButtonProps as Record<string, string>)?.defaultText || "Grünerieren")}
                  className="form-extras__submit-button button-primary"
                  ariaLabel={isMultiStep ? (nextButtonText || 'Weiter') : "Generieren"}
                  type="submit"
                  tabIndex={submitButtonTabIndex}
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
