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
import { createFinalPrompt } from '../../../utils/promptUtils';
import useGroupDetails from '../../groups/hooks/useGroupDetails';

const PresseSocialGenerator = ({ showHeaderFooter = true }) => {
  const { initialContent } = useSharedContent();
  const { user, deutschlandmodus } = useSupabaseAuth();
  
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
  const { 
    setGeneratedContent, 
    getKnowledgeContent,
    knowledgeSourceConfig
  } = useContext(FormContext);
  const [useBackupProvider, setUseBackupProvider] = useState(false);
  const [userCustomSocialPrompt, setUserCustomSocialPrompt] = useState(null);
  const [isUserCustomSocialPromptActive, setIsUserCustomSocialPromptActive] = useState(false);

  useEffect(() => {
    const loadUserCustomSocialPrompt = async () => {
      if (!user) return;
      
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (!module.templatesSupabase) {
          console.warn('Templates Supabase client not available for fetching user custom social prompt.');
          return;
        }
        
        const { templatesSupabase } = module;
        
        const { data, error: fetchError } = await templatesSupabase
          .from('profiles')
          .select('custom_social_prompt')
          .eq('id', user.id)
          .single();
        
        if (fetchError) {
          console.error('Error loading user custom social prompt:', fetchError);
          return;
        }
        
        if (data) {
          setUserCustomSocialPrompt(data.custom_social_prompt || null);
        }
      } catch (err) {
        console.error('Error loading user custom social prompt:', err);
      }
    };
    
    loadUserCustomSocialPrompt();
  }, [user]);

  const { data: groupDetailsData, isLoading: isLoadingGroupDetails } = useGroupDetails(
    knowledgeSourceConfig.type === 'group' ? knowledgeSourceConfig.id : null,
    knowledgeSourceConfig.type === 'group'
  );

  const handleSubmit = useCallback(async () => {
    try {
      const formDataToSubmit = getFormData();
      let activeInstructionsText = null;
      let areInstructionsActive = false;

      if (knowledgeSourceConfig.type === 'user') {
        activeInstructionsText = userCustomSocialPrompt;
        areInstructionsActive = isUserCustomSocialPromptActive;
      } else if (knowledgeSourceConfig.type === 'group' && groupDetailsData?.instructions) {
        activeInstructionsText = groupDetailsData.instructions.custom_social_prompt;
        areInstructionsActive = !!groupDetailsData.instructions.custom_social_prompt;
      }
      
      const knowledgeContent = getKnowledgeContent();
      const finalPrompt = createFinalPrompt(areInstructionsActive ? activeInstructionsText : null, knowledgeContent);

      delete formDataToSubmit.customPrompt; 
      delete formDataToSubmit.knowledgeContent;
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt; 
        console.log('[PresseSocialGenerator] Final combined prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[PresseSocialGenerator] No custom prompt or knowledge for generation.');
      }

      const content = await submitForm(formDataToSubmit, useBackupProvider);
      if (content) {
        setSocialMediaContent(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (submitError) {
      console.error('[PresseSocialGenerator] Error submitting form:', submitError);
    }
  }, [
    getFormData, 
    submitForm, 
    resetSuccess, 
    setGeneratedContent, 
    useBackupProvider, 
    knowledgeSourceConfig,
    userCustomSocialPrompt,
    isUserCustomSocialPromptActive,
    groupDetailsData,
    getKnowledgeContent
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  const formNoticeElement = (() => {
    if (knowledgeSourceConfig.type === 'group' && isLoadingGroupDetails) {
      return (
        <div className="custom-prompt-notice">
          <HiInformationCircle className="info-icon" />
          <span>Lade Gruppenanweisungen & Wissen...</span>
        </div>
      );
    }

    let noticeParts = [];
    let activeInstructionsTextForNotice = null;
    let areInstructionsActiveForNotice = false;
    let instructionsAvailableForNotice = false;
    let sourceNameForNotice = "";

    if (knowledgeSourceConfig.type === 'user') {
      sourceNameForNotice = "Persönliche";
      activeInstructionsTextForNotice = userCustomSocialPrompt;
      areInstructionsActiveForNotice = isUserCustomSocialPromptActive && userCustomSocialPrompt;
      instructionsAvailableForNotice = !!userCustomSocialPrompt;
      if (areInstructionsActiveForNotice) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen`);
      } else if (instructionsAvailableForNotice) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
      }
    } else if (knowledgeSourceConfig.type === 'group') {
      sourceNameForNotice = knowledgeSourceConfig.name || 'Gruppe';
      if (groupDetailsData?.instructions) {
        activeInstructionsTextForNotice = groupDetailsData.instructions.custom_social_prompt;
        areInstructionsActiveForNotice = !!groupDetailsData.instructions.custom_social_prompt;
        instructionsAvailableForNotice = !!groupDetailsData.instructions.custom_social_prompt;
        if (areInstructionsActiveForNotice) {
          noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}"`);
        } else if (instructionsAvailableForNotice) {
          noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}" (inaktiv)`);
        }
      }
    }

    const hasLoadedKnowledge = knowledgeSourceConfig.loadedKnowledgeItems && knowledgeSourceConfig.loadedKnowledgeItems.length > 0;

    if (knowledgeSourceConfig.type !== 'neutral' && hasLoadedKnowledge) {
      if (knowledgeSourceConfig.type === 'user') {
        noticeParts.push('gesamtes persönliches Wissen');
      } else if (knowledgeSourceConfig.type === 'group') {
        noticeParts.push(`gesamtes Wissen der Gruppe "${sourceNameForNotice}"`);
      }
    }
    
    if (deutschlandmodus === true) {
      noticeParts.push("Deutschlandmodus (AWS) aktiv");
    }

    if (noticeParts.length === 0 && knowledgeSourceConfig.type === 'neutral') {
      return (
        <div className="custom-prompt-notice neutral-notice">
          <HiInformationCircle className="info-icon" />
          <span>Standardmodus aktiv. Keine spezifischen Anweisungen, Wissen oder Deutschlandmodus ausgewählt.</span>
        </div>
      );
    }

    if (noticeParts.length === 0) return null;

    const fullNoticeText = noticeParts.join('. ');

    return (
      <div className="custom-prompt-notice">
        <HiInformationCircle className="info-icon" />
        <span>{fullNoticeText}.</span>
      </div>
    );
  })();

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
            className="form-textarea-large"
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
          formNotice={formNoticeElement}
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