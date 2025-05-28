import React, { useEffect, useContext, useRef } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import FormToggleButton from '../../FormToggleButton';
import useAccessibility from '../../../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../../../utils/accessibilityHelpers';
import { BUTTON_LABELS } from '../../../utils/constants';
import FocusTrap from 'focus-trap-react';

// Importiere die Komponenten
import FormSection from './FormSection';
import DisplaySection from './DisplaySection';
import EditorChat from '../../editor/EditorChat';
import Editor from '../../editor/Editor';
import KnowledgeSelector from '../../../common/KnowledgeSelector';

// Importiere die neuen Hooks
import { useFormState, useContentManagement, useErrorHandling, useResponsive, useFocusMode } from '../hooks';
import useKnowledge from '../../../hooks/useKnowledge';
import useGroups from '../../../../features/groups/hooks/useGroups';

// Importiere die Utility-Funktionen
import { getBaseContainerClasses } from '../utils/classNameUtils';

// Import FormContext
import { FormContext } from '../../../utils/FormContext';

// Import BetaFeaturesContext
import { BetaFeaturesContext } from '../../../../context/BetaFeaturesContext';

// Import an icon for the toggle
import { HiChevronDown } from 'react-icons/hi';

/**
 * Basis-Formular-Komponente
 * @param {Object} props - Komponenten-Props
 */
const BaseForm = ({
  title,
  children,
  onSubmit,
  loading,
  success,
  error: propError,
  formErrors = {},
  onGeneratePost,
  generatedPost,
  allowEditing = true,
  initialContent = '',
  alwaysEditing = false,
  hideEditButton = false,
  isMultiStep = false,
  onBack,
  showBackButton = false,
  nextButtonText,
  generatedContent,
  hideDisplayContainer = false,
  usePlatformContainers = false,
  helpContent,
  submitButtonProps = {},
  disableAutoCollapse = false,
  showNextButton = true,
  headerContent,
  webSearchFeatureToggle = null,
  useWebSearchFeatureToggle = false,
  displayActions = null,
  formNotice = null,
  enableKnowledgeSelector = false
}) => {
  // Get knowledge source config from context
  const { 
    knowledgeSourceConfig,
    setKnowledgeSourceConfig
  } = useContext(FormContext);
  
  // Get database beta feature status
  const { databaseBetaEnabled } = useContext(BetaFeaturesContext);
  
  // Hook zum Laden der Gruppen des Benutzers
  const { userGroups: groups, isLoadingGroups, errorGroups: groupsError } = useGroups();

  const formSectionRef = useRef(null);
  const displaySectionRef = useRef(null);

  useEffect(() => {
    // console.log('[BaseForm] useEffect - Data from useGroups - isLoadingGroups:', isLoadingGroups, 'groupsError:', groupsError, 'groups:', groups);
  }, [groups, isLoadingGroups, groupsError]);

  // Verwende die neuen Hooks
  const {
    error: errorState,
    setError
  } = useErrorHandling();
  
  const {
    isFormVisible,
    isMultiPlatform,
    toggleForm,
    checkMultiPlatform,
    markContentChanged,
    resetContentChanged
  } = useFormState({}, disableAutoCollapse);
  
  const {
    value,
    isEditing,
    updateWithGeneratedContent,
    handleToggleEditMode,
    getExportableContent
  } = useContentManagement(initialContent);
  
  const {
    isMobileView,
    getDisplayTitle
  } = useResponsive();

  const {
    isFocusMode,
    handleToggleFocusMode
  } = useFocusMode();

  const { setupKeyboardNav } = useAccessibility();

  // Setze Fehler aus Props
  useEffect(() => {
    if (propError) {
      setError(propError);
    }
  }, [propError, setError]);

  // Aktualisiere generatedContent in value
  useEffect(() => {
    updateWithGeneratedContent(generatedContent);
  }, [generatedContent, updateWithGeneratedContent]);

  // Prüfe auf Multi-Plattform-Inhalte
  useEffect(() => {
    checkMultiPlatform(value, usePlatformContainers);
  }, [value, usePlatformContainers, checkMultiPlatform]);

  // Markiere Inhaltsänderungen
  useEffect(() => {
    markContentChanged(!!value);
  }, [value, markContentChanged]);

  // Zurücksetzen von Inhaltsänderungen beim Scrollen
  useEffect(() => {
    const handleScroll = () => {
      resetContentChanged();
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [resetContentChanged]);

  // Setze alwaysEditing
  useEffect(() => {
    if (alwaysEditing && !isEditing) {
      handleToggleEditMode();
    }
  }, [alwaysEditing, isEditing, handleToggleEditMode]);

  // Verbessere Barrierefreiheit
  useEffect(() => {
    enhanceFocusVisibility();

    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: BUTTON_LABELS.SUBMIT },
      { element: document.querySelector('.generate-post-button'), label: BUTTON_LABELS.GENERATE_TEXT },
      { element: document.querySelector('.copy-button'), label: BUTTON_LABELS.COPY },
      { element: document.querySelector('.edit-button'), label: BUTTON_LABELS.EDIT },
    ].filter(item => item.element !== null);

    if (labelledElements.length > 0) {
      addAriaLabelsToElements(labelledElements);
      const interactiveElements = labelledElements.map(item => item.element);
      setupKeyboardNav(interactiveElements);
    }
  }, [setupKeyboardNav, generatedContent]);

  // Berechne den Anzeigetitel
  const displayTitle = getDisplayTitle(title, isEditing, generatedContent);

  // Berechne die Klassennamen für den Container
  const baseContainerClasses = getBaseContainerClasses({
    isEditing,
    title,
    generatedContent,
    isMultiPlatform,
    isFormVisible,
    isFocusMode
  });

  const handleToggleForm = () => {
    toggleForm();
  };

  return (
    <>
      { !isEditing && headerContent }
      <div className={baseContainerClasses}>
        {!isFocusMode && isMultiPlatform && (
          <FormToggleButton
            isFormVisible={isFormVisible}
            toggleForm={handleToggleForm}
          />
        )}
        {!isFocusMode && (
          isEditing ? (
            <FocusTrap active={isEditing}>
              <div ref={displaySectionRef}>
                <EditorChat isEditing={isEditing} />
              </div>
            </FocusTrap>
          ) : (
            <FormSection
              ref={formSectionRef}
              onSubmit={onSubmit}
              loading={loading}
              success={success}
              formErrors={formErrors}
              isFormVisible={isFormVisible}
              isMultiStep={isMultiStep}
              onBack={onBack}
              showBackButton={showBackButton}
              nextButtonText={nextButtonText}
              submitButtonProps={submitButtonProps}
              webSearchFeatureToggle={webSearchFeatureToggle}
              useWebSearchFeatureToggle={useWebSearchFeatureToggle}
              showSubmitButton={showNextButton}
              formNotice={formNotice}
            >
              {children}
              
              {enableKnowledgeSelector && databaseBetaEnabled && (
                <div className="knowledge-source-config-container">
                  <h3 className="knowledge-selector-heading">Anweisungen & Wissensquelle</h3>
                  <div className="knowledge-source-dropdown">
                    <select 
                      className="knowledge-source-select"
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
                      disabled={isLoadingGroups}
                    >
                      <option value="neutral">Neutral</option>
                      <option value="user">Meine Anweisungen & Wissen</option>
                      {isLoadingGroups && <option disabled>Lade Gruppen...</option>}
                      {!isLoadingGroups && groupsError && (
                        <>
                          <option disabled>Fehler beim Laden der Gruppen</option>
                        </>
                      )}
                      {!isLoadingGroups && !groupsError && groups && groups.map(group => (
                        <option key={group.id} value={`group-${group.id}`}>{group.name} Anweisungen & Wissen</option>
                      ))}
                    </select>
                    <HiChevronDown className="knowledge-source-dropdown-arrow" />
                  </div>
                  <KnowledgeSelector />
                </div>
              )}
            </FormSection>
          )
        )}
        <DisplaySection
          ref={displaySectionRef} // Ref hier weiterleiten für den Editor-Fall
          title={displayTitle}
          error={errorState || propError}
          value={value}
          generatedContent={generatedContent}
          isEditing={isEditing}
          allowEditing={allowEditing}
          hideEditButton={hideEditButton}
          usePlatformContainers={usePlatformContainers}
          helpContent={helpContent}
          generatedPost={generatedPost}
          onGeneratePost={onGeneratePost}
          handleToggleEditMode={handleToggleEditMode}
          getExportableContent={getExportableContent}
          onToggleFocusMode={handleToggleFocusMode}
          isFocusMode={isFocusMode}
          displayActions={displayActions}
        />
        {!isMobileView && !isFocusMode && (
          <Tooltip id="action-tooltip" place="bottom" />
        )}
      </div>
    </>
  );
};

BaseForm.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  error: PropTypes.string,
  formErrors: PropTypes.object,
  onGeneratePost: PropTypes.func,
  generatedPost: PropTypes.string,
  allowEditing: PropTypes.bool,
  initialContent: PropTypes.string,
  alwaysEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,
  useBackupProvider: PropTypes.bool,
  setUseBackupProvider: PropTypes.func,
  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      content: PropTypes.string
    })
  ]),
  hideDisplayContainer: PropTypes.bool,
  usePlatformContainers: PropTypes.bool,
  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
  submitButtonProps: PropTypes.shape({
    statusMessage: PropTypes.string,
    showStatus: PropTypes.bool,
    defaultText: PropTypes.string
  }),
  disableAutoCollapse: PropTypes.bool,
  showNextButton: PropTypes.bool,
  headerContent: PropTypes.node,
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
  displayActions: PropTypes.node,
  formNotice: PropTypes.node,
  enableKnowledgeSelector: PropTypes.bool
};

BaseForm.defaultProps = {
  showNextButton: true,
  webSearchFeatureToggle: null,
  useWebSearchFeatureToggle: false,
  displayActions: null,
  formNotice: null,
  enableKnowledgeSelector: false
};

export default BaseForm; 