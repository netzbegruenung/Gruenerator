import React, { useState, useCallback, useContext, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import StyledCheckbox from '../../../components/common/AnimatedCheckbox';
import { FormContext } from '../../../components/utils/FormContext';
// import { useDynamicTextSize } from '../../../components/utils/commonFunctions';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiInformationCircle } from 'react-icons/hi';
import { createStructuredFinalPrompt } from '../../../utils/promptUtils';
import useGroupDetails from '../../groups/hooks/useGroupDetails';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/generatedTextStore';

const PresseSocialGenerator = ({ showHeaderFooter = true }) => {
  const { initialContent } = useSharedContent();
  const { user, betaFeatures } = useOptimizedAuth();
  const deutschlandmodus = betaFeatures?.deutschlandmodus;
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText: setStoreGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const platformOptions = useMemo(() => [
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'actionIdeas', label: 'Aktionsideen' },
    { id: 'reelScript', label: 'Instagram Reel' },
    { id: 'pressemitteilung', label: 'Pressemitteilung' }
  ], []);

  const defaultPlatforms = useMemo(() => {
    return platformOptions.reduce((acc, platformOpt) => {
      acc[platformOpt.id] = initialContent?.platforms?.[platformOpt.id] || 
                             (platformOpt.id === 'instagram' && initialContent?.isFromSharepic) || 
                             (platformOpt.id === 'twitter' && initialContent?.isFromSharepic) ||
                             false;
      return acc;
    }, {});
  }, [initialContent, platformOptions]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      zitatgeber: initialContent?.zitatgeber || '',
      pressekontakt: initialContent?.pressekontakt || '',
      ...defaultPlatforms
    }
  });

  const watchPressemitteilung = watch('pressemitteilung');

  const [socialMediaContent, setSocialMediaContent] = useState('');
  // const textSize = useDynamicTextSize(socialMediaContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_social');
  const storeGeneratedText = useGeneratedTextStore(state => state.generatedText);
  const { 
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

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);
    try {
      const selectedPlatforms = platformOptions
        .filter(p => rhfData[p.id])
        .map(p => p.id);

      const formDataToSubmit = {
        thema: rhfData.thema,
        details: rhfData.details,
        platforms: selectedPlatforms,
        zitatgeber: rhfData.zitatgeber,
        pressekontakt: rhfData.pressekontakt,
      };
      
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
      const finalPrompt = createStructuredFinalPrompt(
        areInstructionsActive ? activeInstructionsText : null,
        knowledgeContent
      );
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt; 
        console.log('[PresseSocialGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[PresseSocialGenerator] No custom instructions or knowledge for generation.');
      }

      const content = await submitForm(formDataToSubmit, useBackupProvider);
      if (content) {
        setSocialMediaContent(content);
        setStoreGeneratedText(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (submitError) {
      console.error('[PresseSocialGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [
    submitForm, 
    resetSuccess, 
    setStoreGeneratedText,
    setStoreIsLoading,
    useBackupProvider, 
    knowledgeSourceConfig,
    userCustomSocialPrompt,
    isUserCustomSocialPromptActive,
    groupDetailsData,
    getKnowledgeContent,
    platformOptions
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setStoreGeneratedText(content);
  }, [setStoreGeneratedText]);

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

  const helpContent = {
    content: "Dieser Grünerator erstellt professionelle Pressemitteilungen und Social Media Inhalte basierend auf deinen Angaben.",
    tips: [
      "Gib ein klares, prägnantes Thema an",
      "Füge wichtige Details und Fakten hinzu",
      "Wähle die gewünschten Plattformen aus",
      "Bei Pressemitteilungen: Angabe von Zitatgeber und Pressekontakt erforderlich"
    ]
  };

  const renderFormInputs = () => (
    <>
      <Input
        name="thema"
        control={control}
        label={FORM_LABELS.THEME}
        placeholder={FORM_PLACEHOLDERS.THEME}
        rules={{ required: 'Thema ist ein Pflichtfeld' }}
      />

      <Textarea
        name="details"
        control={control}
        label={FORM_LABELS.DETAILS}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        rules={{ required: 'Details sind ein Pflichtfeld' }}
        minRows={3}
        maxRows={10}
        className="form-textarea-large"
      />

      <AnimatePresence>
        {watchPressemitteilung && (
          <motion.div 
            className="press-release-fields"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ 
              type: "spring", 
              stiffness: 400, 
              damping: 25,
              duration: 0.25 
            }}
          >
            <Input
              name="zitatgeber"
              control={control}
              label={FORM_LABELS.WHO_QUOTE}
              subtext="Mehrere Personen können genannt werden."
              placeholder={FORM_PLACEHOLDERS.WHO_QUOTE}
              rules={{ required: 'Zitatgeber ist ein Pflichtfeld für Pressemitteilungen' }}
            />
            
            <Textarea
              name="pressekontakt"
              control={control}
              label={FORM_LABELS.PRESS_CONTACT}
              placeholder={FORM_PLACEHOLDERS.PRESS_CONTACT}
              rules={{ required: 'Pressekontakt ist ein Pflichtfeld für Pressemitteilungen' }}
              minRows={3}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
  
  const renderPlatformCheckboxesSection = () => (
    <>
      <h3>Plattformen & Formate</h3>
      <div className="platform-checkboxes">
        {platformOptions.map((platformOpt) => (
          <Controller
            key={platformOpt.id}
            name={platformOpt.id}
            control={control}
            render={({ field }) => (
              <StyledCheckbox
                id={`checkbox-${platformOpt.id}`}
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                label={platformOpt.label}
              />
            )}
          />
        ))}
      </div>
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Presse- & Social Media Grünerator"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          useBackupProvider={useBackupProvider}
          setUseBackupProvider={setUseBackupProvider}
          usePlatformContainers={true}
          formNotice={formNoticeElement}
          enableKnowledgeSelector={true}
          helpContent={helpContent}
          bottomSectionChildren={renderPlatformCheckboxesSection()}
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