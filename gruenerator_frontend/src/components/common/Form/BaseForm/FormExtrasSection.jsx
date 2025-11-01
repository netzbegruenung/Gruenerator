import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import FeatureToggle from '../../FeatureToggle';
import FeatureIcons from '../../FeatureIcons';
import SubmitButton from '../../SubmitButton';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { useFormStateSelector } from '../FormStateProvider';
import { useGeneratorKnowledgeStore } from '../../../../stores/core/generatorKnowledgeStore';

/**
 * Komponente für zusätzliche Formular-Features (Extras)
 * @param {Object} props - Komponenten-Props
 * @param {Object} props.webSearchFeatureToggle - Props für den Web Search Feature-Toggle
 * @param {boolean} props.useWebSearchFeatureToggle - Soll der Web Search Feature-Toggle verwendet werden
 * @param {Object} props.privacyModeToggle - Props für den Privacy-Mode Feature-Toggle
 * @param {boolean} props.usePrivacyModeToggle - Soll der Privacy-Mode Feature-Toggle verwendet werden
 * @param {Object} props.formControl - React Hook Form Control Object
 * @param {node} props.formNotice - Hinweis oder Information im Formular
 * @param {Function} props.onSubmit - Submit-Handler für das Formular
 * @param {boolean} props.loading - Loading-Status
 * @param {boolean} props.success - Success-Status
 * @param {boolean} props.isMultiStep - Ist Multi-Step Formular
 * @param {string} props.nextButtonText - Text für Weiter-Button
 * @param {Object} props.submitButtonProps - Props für Submit-Button
 * @param {boolean} props.showSubmitButton - Soll Submit-Button angezeigt werden
 * @param {node} props.children - Zusätzliche Extra-Komponenten
 * @param {node} props.firstExtrasChildren - Zusätzliche Extra-Komponenten als erstes Element
 * @param {Object} props.featureIconsTabIndex - TabIndex-Objekt für FeatureIcons (webSearch, balancedMode, attachment, anweisungen)
 * @returns {JSX.Element} Formular-Extras Sektion
 */
const FormExtrasSection = ({
  webSearchFeatureToggle,
  privacyModeToggle,
  proModeToggle,
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
  },
  submitButtonTabIndex = 17,
  onPrivacyInfoClick,
  onWebSearchInfoClick,
  componentName,
  hide = false
}) => {
  // Store selectors
  const loading = useFormStateSelector(state => state.loading);
  const success = useFormStateSelector(state => state.success);
  const useWebSearchFeatureToggle = useFormStateSelector(state => state.webSearchConfig.enabled);
  const usePrivacyModeToggle = useFormStateSelector(state => state.privacyModeConfig.enabled);
  const useInteractiveModeToggleStore = useFormStateSelector(state => state.interactiveModeConfig?.enabled || false);
  const useFeatureIcons = useFormStateSelector(state => state.useFeatureIcons);
  const attachedFiles = useFormStateSelector(state => state.attachedFiles);
  // Pro mode from store (fallback if no prop provided)
  const storeProModeActive = useFormStateSelector(state => state.proModeConfig?.isActive);
  const setStoreProModeActive = useFormStateSelector(state => state.setProModeActive);

  // Get current generated content for info link display logic
  const currentGeneratedContent = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');

  // Anweisungen state from knowledge store
  const source = useGeneratorKnowledgeStore(state => state.source);
  const setSource = useGeneratorKnowledgeStore(state => state.setSource);
  const anweisungenActive = source.type === 'user';

  // Anweisungen toggle handler
  const handleAnweisungenClick = useCallback(() => {
    if (source.type === 'user') {
      setSource({ type: 'neutral', id: null, name: null });
    } else {
      setSource({ type: 'user', id: null, name: 'Meine Anweisungen' });
    }
  }, [source.type, setSource]);

  // Interactive mode toggle handler
  const handleInteractiveModeClick = useCallback(() => {
    if (interactiveModeToggle && interactiveModeToggle.onToggle) {
      interactiveModeToggle.onToggle(!interactiveModeToggle.isActive);
    }
  }, [interactiveModeToggle]);

  // Early return if hide prop is true
  if (hide) {
    return null;
  }

  // Don't render if no extras are enabled
  const hasExtras = useWebSearchFeatureToggle ||
                   usePrivacyModeToggle ||
                   useInteractiveModeToggle ||
                   formNotice ||
                   showSubmitButton ||
                   children ||
                   firstExtrasChildren ||
                   true; // Always show to allow KnowledgeSelector to manage its own visibility

  if (!hasExtras) {
    return null;
  }

  return (
    <div className="form-section__extras">
      <div className="form-extras__content">
        
        {/* First extras - rendered as first element */}
        {firstExtrasChildren && (
          <div className="form-extras__item form-extras__first">
            {firstExtrasChildren}
          </div>
        )}

        {/* Feature Icons - now includes integrated knowledge selector and anweisungen */}
        {useFeatureIcons && webSearchFeatureToggle && privacyModeToggle && (
          <div className="form-extras__item">
            <FeatureIcons
              onWebSearchClick={() => webSearchFeatureToggle.onToggle(!webSearchFeatureToggle.isActive)}
              onPrivacyModeClick={() => {
                // If enabling privacy, ensure pro mode is off in store
                if (!privacyModeToggle.isActive && storeProModeActive) setStoreProModeActive(false);
                privacyModeToggle.onToggle(!privacyModeToggle.isActive);
              }}
              onProModeClick={proModeToggle ? () => proModeToggle.onToggle(!proModeToggle.isActive) : () => setStoreProModeActive(!storeProModeActive)}
              onBalancedModeClick={balancedModeToggle ? () => balancedModeToggle.onToggle(!balancedModeToggle.isActive) : () => {}}
              onAttachmentClick={onAttachmentClick}
              onRemoveFile={onRemoveFile}
              onAnweisungenClick={handleAnweisungenClick}
              onInteractiveModeClick={interactiveModeToggle && useInteractiveModeToggleStore ? handleInteractiveModeClick : undefined}
              webSearchActive={webSearchFeatureToggle.isActive}
              privacyModeActive={privacyModeToggle.isActive}
              proModeActive={proModeToggle ? proModeToggle.isActive : !!storeProModeActive}
              anweisungenActive={anweisungenActive}
              interactiveModeActive={interactiveModeToggle ? interactiveModeToggle.isActive : false}
              attachedFiles={attachedFiles}
              className="form-extras__feature-icons"
              tabIndex={featureIconsTabIndex}
              showPrivacyInfoLink={privacyModeToggle.isActive && !currentGeneratedContent}
              onPrivacyInfoClick={onPrivacyInfoClick}
              showWebSearchInfoLink={webSearchFeatureToggle.isActive && !currentGeneratedContent}
              onWebSearchInfoClick={onWebSearchInfoClick}
            />
          </div>
        )}

        {/* Form Notice */}
        {formNotice && (
          <div className="form-extras__item form-extras__notice">
            {formNotice}
          </div>
        )}

        {/* Web Search Feature Toggle - only show if not using feature icons */}
        {!useFeatureIcons && webSearchFeatureToggle && useWebSearchFeatureToggle && (
          <div className="form-extras__item">
            <FeatureToggle {...webSearchFeatureToggle} className="form-feature-toggle" />
          </div>
        )}

        {/* Privacy-Mode Feature Toggle - only show if not using feature icons */}
        {!useFeatureIcons && privacyModeToggle && usePrivacyModeToggle && (
          <div className="form-extras__item">
            <FeatureToggle {...privacyModeToggle} className="form-feature-toggle" />
          </div>
        )}

        {/* Interactive-Mode Feature Toggle - integrated in FeatureIcons when useFeatureIcons is true */}
        {!useFeatureIcons && interactiveModeToggle && useInteractiveModeToggle && (
          <div className="form-extras__item">
            <FeatureToggle {...interactiveModeToggle} className="form-feature-toggle" />
          </div>
        )}

        {/* Additional custom extras */}
        {children && (
          <div className="form-extras__item form-extras__custom">
            {children}
          </div>
        )}

        {/* Submit Button - using existing optimized component */}
        {showSubmitButton && (
          <div className="form-extras__item form-extras__submit">
            <SubmitButton
              onClick={onSubmit}
              loading={loading}
              success={success}
              text={isMultiStep ? (nextButtonText || 'Weiter') : (submitButtonProps.defaultText || "Grünerieren")}
              className="form-extras__submit-button button-primary"
              ariaLabel={isMultiStep ? (nextButtonText || 'Weiter') : "Generieren"}
              type="submit"
              tabIndex={submitButtonTabIndex}
              {...submitButtonProps}
            />
          </div>
        )}
        
      </div>
    </div>
  );
};

FormExtrasSection.propTypes = {
  webSearchFeatureToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    isSearching: PropTypes.bool,
    statusMessage: PropTypes.string,
    tabIndex: PropTypes.number
  }),
  privacyModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    tabIndex: PropTypes.number
  }),
  proModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    tabIndex: PropTypes.number
  }),
  balancedModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    tabIndex: PropTypes.number
  }),
  interactiveModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    tabIndex: PropTypes.number
  }),
  useInteractiveModeToggle: PropTypes.bool,
  onAttachmentClick: PropTypes.func,
  onRemoveFile: PropTypes.func,
  formControl: PropTypes.object,
  formNotice: PropTypes.node,
  onSubmit: PropTypes.func,
  isMultiStep: PropTypes.bool,
  nextButtonText: PropTypes.string,
  submitButtonProps: PropTypes.shape({
    statusMessage: PropTypes.string,
    showStatus: PropTypes.bool,
    defaultText: PropTypes.string
  }),
  showSubmitButton: PropTypes.bool,
  children: PropTypes.node,
  firstExtrasChildren: PropTypes.node,
  featureIconsTabIndex: PropTypes.shape({
    webSearch: PropTypes.number,
    balancedMode: PropTypes.number,
    attachment: PropTypes.number,
    anweisungen: PropTypes.number
  }),
  submitButtonTabIndex: PropTypes.number,
  onPrivacyInfoClick: PropTypes.func,
  onWebSearchInfoClick: PropTypes.func,
  componentName: PropTypes.string,
  hide: PropTypes.bool
};

FormExtrasSection.defaultProps = {
  formControl: null,
  formNotice: null,
  isMultiStep: false,
  nextButtonText: null,
  submitButtonProps: {},
  showSubmitButton: true,
  featureIconsTabIndex: {
    webSearch: 11,
    balancedMode: 12,
    attachment: 13,
    anweisungen: 14
  },
  submitButtonTabIndex: 17,
  onPrivacyInfoClick: undefined,
  componentName: 'default',
  hide: false
};

FormExtrasSection.displayName = 'FormExtrasSection';

export default React.memo(FormExtrasSection); 
