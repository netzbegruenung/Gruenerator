import React from 'react';
import PropTypes from 'prop-types';
import FeatureToggle from '../../FeatureToggle';
import SubmitButton from '../../SubmitButton';
import KnowledgeSelector from '../../../common/KnowledgeSelector/KnowledgeSelector';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';
import { useGeneratorKnowledgeStore } from '../../../../stores/core/generatorKnowledgeStore';

/**
 * Komponente für zusätzliche Formular-Features (Extras)
 * @param {Object} props - Komponenten-Props
 * @param {Object} props.webSearchFeatureToggle - Props für den Web Search Feature-Toggle
 * @param {boolean} props.useWebSearchFeatureToggle - Soll der Web Search Feature-Toggle verwendet werden
 * @param {boolean} props.enableKnowledgeSelector - Soll der Knowledge Selector aktiviert werden
 * @param {boolean} props.enableDocumentSelector - Soll der Document Selector aktiviert werden
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
 * @returns {JSX.Element} Formular-Extras Sektion
 */
const FormExtrasSection = ({
  webSearchFeatureToggle,
  useWebSearchFeatureToggle = false,
  enableKnowledgeSelector = false,
  enableDocumentSelector = false,
  formControl = null,
  formNotice = null,
  onSubmit,
  loading = false,
  success = false,
  isMultiStep = false,
  nextButtonText = null,
  submitButtonProps = {},
  showSubmitButton = true,
  children,
  firstExtrasChildren = null,
  knowledgeSelectorTabIndex = 14,
  knowledgeSourceSelectorTabIndex = 13,
  documentSelectorTabIndex = 15,
  submitButtonTabIndex = 17
}) => {
  // Simplified store access
  const { source, availableKnowledge } = useGeneratorKnowledgeStore();
  
  const { getBetaFeatureState, isLoading: isLoadingBetaFeatures } = useBetaFeatures();
  const anweisungenBetaEnabled = getBetaFeatureState('anweisungen');

  // Don't render if no extras are enabled
  const hasExtras = useWebSearchFeatureToggle || 
                   (enableKnowledgeSelector && (anweisungenBetaEnabled || isLoadingBetaFeatures)) || 
                   enableDocumentSelector ||
                   formNotice || 
                   showSubmitButton ||
                   children ||
                   firstExtrasChildren;

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
        
        {/* Knowledge Selector - using existing optimized component with source selection and document selection */}
        {(enableKnowledgeSelector || enableDocumentSelector) && (anweisungenBetaEnabled || isLoadingBetaFeatures || enableDocumentSelector) && (
          <div className="form-extras__item">
            <KnowledgeSelector 
              enableSelection={enableKnowledgeSelector}
              enableSourceSelection={enableKnowledgeSelector}
              enableDocumentSelection={enableDocumentSelector}
              disabled={isLoadingBetaFeatures || (!anweisungenBetaEnabled && !enableDocumentSelector)}
              tabIndex={knowledgeSelectorTabIndex}
              sourceTabIndex={knowledgeSourceSelectorTabIndex}
              documentTabIndex={documentSelectorTabIndex}
            />
          </div>
        )}

        {/* Form Notice */}
        {formNotice && (
          <div className="form-extras__item form-extras__notice">
            {formNotice}
          </div>
        )}

        {/* Web Search Feature Toggle */}
        {webSearchFeatureToggle && useWebSearchFeatureToggle && (
          <div className="form-extras__item">
            <FeatureToggle {...webSearchFeatureToggle} className="form-feature-toggle" />
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
    statusMessage: PropTypes.string
  }),
  useWebSearchFeatureToggle: PropTypes.bool,
  enableKnowledgeSelector: PropTypes.bool,
  enableDocumentSelector: PropTypes.bool,
  formControl: PropTypes.object,
  formNotice: PropTypes.node,
  onSubmit: PropTypes.func,
  loading: PropTypes.bool,
  success: PropTypes.bool,
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
  submitButtonTabIndex: PropTypes.number
};

FormExtrasSection.defaultProps = {
  useWebSearchFeatureToggle: false,
  enableKnowledgeSelector: false,
  enableDocumentSelector: false,
  formControl: null,
  formNotice: null,
  loading: false,
  success: false,
  isMultiStep: false,
  nextButtonText: null,
  submitButtonProps: {},
  showSubmitButton: true,
  knowledgeSelectorTabIndex: 14,
  knowledgeSourceSelectorTabIndex: 13,
  documentSelectorTabIndex: 15,
  submitButtonTabIndex: 17
};

FormExtrasSection.displayName = 'FormExtrasSection';

export default React.memo(FormExtrasSection); 