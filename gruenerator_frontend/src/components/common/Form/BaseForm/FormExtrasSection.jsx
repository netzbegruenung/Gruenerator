import React from 'react';
import PropTypes from 'prop-types';
import FeatureToggle from '../../FeatureToggle';
import FeatureIcons from '../../FeatureIcons';
import SubmitButton from '../../SubmitButton';
import KnowledgeSelector from '../../../common/KnowledgeSelector/KnowledgeSelector';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import { useGeneratorKnowledgeStore } from '../../../../stores/core/generatorKnowledgeStore';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import { useFormStateSelector } from '../FormStateProvider';

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
 * @param {boolean} props.showProfileSelector - Zeige Profile Selector in KnowledgeSelector
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
    attachment: 13
  },
  knowledgeSelectorTabIndex = 14,
  knowledgeSourceSelectorTabIndex = 13,
  documentSelectorTabIndex = 15,
  submitButtonTabIndex = 17,
  showProfileSelector = true,
  onPrivacyInfoClick,
  onWebSearchInfoClick,
  componentName,
  enableKnowledgeSelector = false
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
  
  // Simplified store access
  const { source, availableKnowledge } = useGeneratorKnowledgeStore();
  const currentGeneratedContent = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');
  
  const { getBetaFeatureState, isLoading: isLoadingBetaFeatures } = useBetaFeatures();
  const anweisungenBetaEnabled = true;

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
        
        {/* Knowledge Selector - conditionally rendered based on enableKnowledgeSelector prop */}
        {enableKnowledgeSelector !== false && (
          <div className="form-extras__item">
            <KnowledgeSelector
              disabled={isLoadingBetaFeatures}
              tabIndex={knowledgeSelectorTabIndex}
              sourceTabIndex={knowledgeSourceSelectorTabIndex}
              documentTabIndex={documentSelectorTabIndex}
              showProfileSelector={showProfileSelector}
            />
          </div>
        )}

        {/* Feature Icons - alternative to feature toggles */}
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
              webSearchActive={webSearchFeatureToggle.isActive}
              privacyModeActive={privacyModeToggle.isActive}
              proModeActive={proModeToggle ? proModeToggle.isActive : !!storeProModeActive}
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

        {/* Interactive-Mode Feature Toggle - only show if not using feature icons */}
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
  knowledgeSelectorTabIndex: PropTypes.number,
  knowledgeSourceSelectorTabIndex: PropTypes.number,
  documentSelectorTabIndex: PropTypes.number,
  submitButtonTabIndex: PropTypes.number,
  onPrivacyInfoClick: PropTypes.func,
  onWebSearchInfoClick: PropTypes.func,
  componentName: PropTypes.string,
  enableKnowledgeSelector: PropTypes.bool
};

FormExtrasSection.defaultProps = {
  enableKnowledgeSelector: false,
  enableDocumentSelector: false,
  formControl: null,
  formNotice: null,
  isMultiStep: false,
  nextButtonText: null,
  submitButtonProps: {},
  showSubmitButton: true,
  knowledgeSelectorTabIndex: 14,
  knowledgeSourceSelectorTabIndex: 13,
  documentSelectorTabIndex: 15,
  submitButtonTabIndex: 17,
  onPrivacyInfoClick: undefined,
  componentName: 'default'
};

FormExtrasSection.displayName = 'FormExtrasSection';

export default React.memo(FormExtrasSection); 
