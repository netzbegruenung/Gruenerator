import React, { useState, useCallback, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import StyledCheckbox from '../../../components/common/AnimatedCheckbox';
import { FormContext } from '../../../components/utils/FormContext';
import { useDynamicTextSize } from '../../../components/utils/commonFunctions';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import { usePresseSocialForm } from './hooks';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import { HiInformationCircle } from 'react-icons/hi';

const PresseSocialGenerator = ({ showHeaderFooter = true }) => {
  const { initialContent } = useSharedContent();
  const { user } = useSupabaseAuth();
  
  const {
    thema,
    setThema,
    details,
    setDetails,
    platforms,
    handlePlatformChange,
    zitatgeber,
    setZitatgeber,
    pressekontakt,
    setPressekontakt,
    getFormData
  } = usePresseSocialForm(initialContent);

  const [socialMediaContent, setSocialMediaContent] = useState('');
  const textSize = useDynamicTextSize(socialMediaContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_social');
  const { setGeneratedContent, getKnowledgeContent } = useContext(FormContext);
  const [useBackupProvider, setUseBackupProvider] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(null);
  const [isCustomPromptActive, setIsCustomPromptActive] = useState(false);

  // Benutzeranweisungen aus dem Profil laden
  useEffect(() => {
    const loadCustomPrompt = async () => {
      if (!user) return;
      
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (!module.templatesSupabase) {
          console.warn('Templates Supabase client not available for fetching custom prompt.');
          return;
        }
        
        const { templatesSupabase } = module;
        
        const { data, error } = await templatesSupabase
          .from('profiles')
          .select('custom_social_prompt, custom_social_prompt_active')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error('Fehler beim Laden des benutzerdefinierten Prompts:', error);
          return;
        }
        
        if (data) {
          setCustomPrompt(data.custom_social_prompt || null);
          setIsCustomPromptActive(data.custom_social_prompt_active || false);
        }
      } catch (err) {
        console.error('Fehler beim Laden des benutzerdefinierten Prompts:', err);
      }
    };
    
    loadCustomPrompt();
  }, [user]);

  const handleSubmit = useCallback(async () => {
    try {
      const formData = getFormData();

      // Benutzerdefinierte Anweisungen hinzufügen, falls vorhanden und aktiviert
      if (isCustomPromptActive && customPrompt) {
        formData.customPrompt = customPrompt;
        console.log('[PresseSocialGenerator] Benutzerdefinierter Prompt hinzugefügt');
      }

      // Wissensbausteine hinzufügen, falls vorhanden
      const knowledgeContent = getKnowledgeContent();
      if (knowledgeContent) {
        formData.knowledgeContent = knowledgeContent;
        console.log('[PresseSocialGenerator] Wissensbausteine hinzugefügt');
      }

      const content = await submitForm(formData, useBackupProvider);
      if (content) {
        setSocialMediaContent(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      // Error handling
    }
  }, [getFormData, submitForm, resetSuccess, setGeneratedContent, useBackupProvider, isCustomPromptActive, customPrompt, getKnowledgeContent]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  // Erstelle das Element für den Hinweis
  const customPromptNotice = isCustomPromptActive && customPrompt ? (
    <div className="custom-prompt-notice">
      <HiInformationCircle className="info-icon" />
      <span>Benutzerdefinierte Anweisungen sind aktiv.</span>
    </div>
  ) : null;

  const renderFormInputs = () => (
    <>
      <h3><label htmlFor="thema">{FORM_LABELS.THEME}</label></h3>
      <input
        id="thema"
        type="text"
        name="thema"
        placeholder={FORM_PLACEHOLDERS.THEME}
        value={thema}
        onChange={(e) => setThema(e.target.value)}
        aria-required="true"
      />

      <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
      <textarea
        id="details"
        name="details"
        style={{ height: '120px' }}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-required="true"
      />

      <h3>Plattformen & Formate</h3>
      <div className="platform-checkboxes">
        {Object.entries(platforms).map(([platform, isChecked]) => (
          <StyledCheckbox
            key={platform}
            id={`checkbox-${platform}`}
            checked={isChecked}
            onChange={() => handlePlatformChange(platform)}
            label={
              platform === 'actionIdeas' ? 'Aktionsideen' :
              platform === 'reelScript' ? 'Instagram Reel' :
              platform === 'pressemitteilung' ? 'Pressemitteilung' :
              platform.charAt(0).toUpperCase() + platform.slice(1)
            }
          />
        ))}
      </div>

      {platforms.pressemitteilung && (
        <div className="press-release-fields">
          <h3><label htmlFor="zitatgeber">{FORM_LABELS.WHO_QUOTE}</label></h3>
          <p className="subtext">Mehrere Personen können genannt werden.</p>
          <input
            id="zitatgeber"
            type="text"
            name="zitatgeber"
            placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
            value={zitatgeber}
            onChange={(e) => setZitatgeber(e.target.value)}
            aria-required="true"
          />
          
          <h3><label htmlFor="pressekontakt">{FORM_LABELS.PRESS_CONTACT}</label></h3>
          <textarea
            id="pressekontakt"
            name="pressekontakt"
            placeholder={FORM_PLACEHOLDERS.PRESS_CONTACT}
            value={pressekontakt}
            onChange={(e) => setPressekontakt(e.target.value)}
            aria-required="true"
          ></textarea>
        </div>
      )}
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Presse- & Social Media Grünerator"
          onSubmit={handleSubmit}
          loading={loading}
          success={success}
          error={error}
          generatedContent={socialMediaContent}
          textSize={textSize}
          onGeneratedContentChange={handleGeneratedContentChange}
          useBackupProvider={useBackupProvider}
          setUseBackupProvider={setUseBackupProvider}
          usePlatformContainers={true}
          formNotice={customPromptNotice}
          enableKnowledgeSelector={true}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

PresseSocialGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default PresseSocialGenerator; 