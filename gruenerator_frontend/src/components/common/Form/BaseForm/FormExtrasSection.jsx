import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import FeatureToggle from '../../FeatureToggle';
import SubmitButton from '../../SubmitButton';
import KnowledgeSelector from '../../../common/KnowledgeSelector';
import FormSelect from '../Input/FormSelect';
import { FormContext } from '../../../utils/FormContext';
import useGroups from '../../../../features/groups/hooks/useGroups';
import { useLazyAuth } from '../../../../hooks/useAuth';

/**
 * Komponente für zusätzliche Formular-Features (Extras)
 * @param {Object} props - Komponenten-Props
 * @param {Object} props.webSearchFeatureToggle - Props für den Web Search Feature-Toggle
 * @param {boolean} props.useWebSearchFeatureToggle - Soll der Web Search Feature-Toggle verwendet werden
 * @param {boolean} props.enableKnowledgeSelector - Soll der Knowledge Selector aktiviert werden
 * @param {node} props.formNotice - Hinweis oder Information im Formular
 * @param {Function} props.onSubmit - Submit-Handler für das Formular
 * @param {boolean} props.loading - Loading-Status
 * @param {boolean} props.success - Success-Status
 * @param {boolean} props.isMultiStep - Ist Multi-Step Formular
 * @param {string} props.nextButtonText - Text für Weiter-Button
 * @param {Object} props.submitButtonProps - Props für Submit-Button
 * @param {boolean} props.showSubmitButton - Soll Submit-Button angezeigt werden
 * @param {node} props.children - Zusätzliche Extra-Komponenten
 * @returns {JSX.Element} Formular-Extras Sektion
 */
const FormExtrasSection = ({
  webSearchFeatureToggle,
  useWebSearchFeatureToggle = false,
  enableKnowledgeSelector = false,
  formNotice = null,
  onSubmit,
  loading = false,
  success = false,
  isMultiStep = false,
  nextButtonText = null,
  submitButtonProps = {},
  showSubmitButton = true,
  children
}) => {
  const { 
    knowledgeSourceConfig,
    setKnowledgeSourceConfig
  } = useContext(FormContext);
  
  const { betaFeatures, isLoadingBetaFeatures } = useLazyAuth();
  const anweisungenBetaEnabled = betaFeatures?.anweisungen === true;
  const { userGroups: groups, isLoadingGroups, errorGroups: groupsError } = useGroups();

  // Don't render if no extras are enabled
  const hasExtras = useWebSearchFeatureToggle || 
                   (enableKnowledgeSelector && (anweisungenBetaEnabled || isLoadingBetaFeatures)) || 
                   formNotice || 
                   showSubmitButton ||
                   children;

  if (!hasExtras) {
    return null;
  }

  return (
    <div className="form-section__extras">
      <div className="form-extras__content">
        
        {/* Knowledge Source Selection */}
        {enableKnowledgeSelector && (anweisungenBetaEnabled || isLoadingBetaFeatures) && (
          <div className="form-extras__item">
            <FormSelect
              name="knowledge-source"
              label="Anweisungen & Wissensquelle"
              options={[
                { value: 'neutral', label: 'Neutral' },
                { value: 'user', label: 'Meine Anweisungen & Wissen' },
                ...(isLoadingBetaFeatures ? [{ value: '', label: 'Lade Beta Features...', disabled: true }] : []),
                ...(isLoadingGroups ? [{ value: '', label: 'Lade Gruppen...', disabled: true }] : []),
                ...(groupsError && !isLoadingGroups ? [{ value: '', label: 'Fehler beim Laden der Gruppen', disabled: true }] : []),
                ...(groups && !isLoadingGroups && !groupsError ? 
                  groups.map(group => ({
                    value: `group-${group.id}`,
                    label: `${group.name} Anweisungen & Wissen`
                  })) : []
                )
              ]}
              value={knowledgeSourceConfig.type === 'group' ? `group-${knowledgeSourceConfig.id}` : knowledgeSourceConfig.type}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'neutral') {
                  setKnowledgeSourceConfig({ type: 'neutral', id: null, name: 'Neutral' });
                } else if (value === 'user') {
                  setKnowledgeSourceConfig({ type: 'user', id: null, name: 'Meine Anweisungen & Wissen' });
                } else if (value.startsWith('group-')) {
                  const groupId = value.substring("group-".length);
                  const selectedGroup = groups.find(g => g.id === groupId);
                  if (selectedGroup) {
                    setKnowledgeSourceConfig({ type: 'group', id: selectedGroup.id, name: selectedGroup.name });
                  }
                }
              }}
              disabled={isLoadingGroups || isLoadingBetaFeatures || !anweisungenBetaEnabled}
            />
            <KnowledgeSelector />
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

        {/* Submit Button */}
        {showSubmitButton && (
          <div className="form-extras__item form-extras__submit">
            <SubmitButton
              onClick={onSubmit}
              loading={loading}
              success={success}
              text={isMultiStep ? (nextButtonText || 'Weiter') : (submitButtonProps.defaultText || "Grünerieren")}
              icon={<HiCog />}
              className="form-extras__submit-button button-primary"
              ariaLabel={isMultiStep ? (nextButtonText || 'Weiter') : "Generieren"}
              type="submit"
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
  children: PropTypes.node
};

FormExtrasSection.defaultProps = {
  useWebSearchFeatureToggle: false,
  enableKnowledgeSelector: false,
  formNotice: null,
  loading: false,
  success: false,
  isMultiStep: false,
  nextButtonText: null,
  submitButtonProps: {},
  showSubmitButton: true
};

FormExtrasSection.displayName = 'FormExtrasSection';

export default FormExtrasSection; 