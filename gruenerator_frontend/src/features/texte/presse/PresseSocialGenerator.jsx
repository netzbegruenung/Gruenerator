import React, { useState, useCallback, useContext, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import StyledCheckbox from '../../../components/common/AnimatedCheckbox';
// import { useDynamicTextSize } from '../../../components/utils/commonFunctions';
import { useSharedContent } from '../../../components/hooks/useSharedContent';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiInformationCircle } from 'react-icons/hi';
import { createStructuredFinalPrompt, createBasePromptFromFormData } from '../../../utils/promptUtils';
import useGroupDetails from '../../groups/hooks/useGroupDetails';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';

const PresseSocialGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'presse-social';
  const { initialContent } = useSharedContent();
  const { user, betaFeatures } = useOptimizedAuth();
  const deutschlandmodus = betaFeatures?.deutschlandmodus;
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Initialize knowledge system
  useKnowledge();

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
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  
  // Store integration - all knowledge and instructions from store
  const {
    source,
    availableKnowledge,
    selectedKnowledgeIds,
    instructions,
    isInstructionsActive,
    getKnowledgeContent,
    getActiveInstruction
  } = useGeneratorKnowledgeStore();
  
  const { data: groupDetailsData, isLoading: isLoadingGroupDetails } = useGroupDetails(
    source.type === 'group' ? source.id : null,
    source.type === 'group'
  );

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    console.log('[PresseSocialGenerator] Formular abgeschickt. Store-Status:', {
        source,
        availableKnowledgeCount: availableKnowledge.length,
        selectedKnowledgeIds: Array.from(selectedKnowledgeIds),
        hasSelectedKnowledge: selectedKnowledgeIds.size > 0,
        instructions,
        isInstructionsActive,
        groupInstructions: groupDetailsData?.instructions?.custom_social_prompt ? `Vorhanden, Länge: ${groupDetailsData.instructions.custom_social_prompt.length}` : null,
    });

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
      
      // Get active instruction based on source
      let activeInstruction = null;
      if (source.type === 'user' && isInstructionsActive) {
        activeInstruction = getActiveInstruction('social');
      } else if (source.type === 'group' && groupDetailsData?.instructions) {
        activeInstruction = groupDetailsData.instructions.custom_social_prompt;
      }
      
      // Get knowledge content from store
      const knowledgeContent = getKnowledgeContent();
      
      // Create base prompt from form data
      const basePrompt = createBasePromptFromFormData(formDataToSubmit);

      const finalPrompt = createStructuredFinalPrompt(
        activeInstruction,
        knowledgeContent,
        basePrompt
      );
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt; 
        console.log('[PresseSocialGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[PresseSocialGenerator] No custom instructions or knowledge for generation.');
      }

      const content = await submitForm(formDataToSubmit);
      if (content) {
        setSocialMediaContent(content);
        setGeneratedText(componentName, content);
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
    setGeneratedText,
    setStoreIsLoading,
    source,
    availableKnowledge,
    selectedKnowledgeIds,
    instructions,
    isInstructionsActive,
    getKnowledgeContent,
    getActiveInstruction,
    groupDetailsData,
    platformOptions
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setSocialMediaContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const formNoticeElement = (() => {
    if (source.type === 'group' && isLoadingGroupDetails) {
      return (
        <div className="custom-prompt-notice">
          <HiInformationCircle className="info-icon" />
          <span>Lade Gruppenanweisungen & Wissen...</span>
        </div>
      );
    }

    let noticeParts = [];
    let sourceNameForNotice = "";

    if (source.type === 'user') {
      sourceNameForNotice = "Persönliche";
      if (isInstructionsActive && instructions.social) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen`);
      } else if (instructions.social) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
      }
    } else if (source.type === 'group') {
      sourceNameForNotice = source.name || 'Gruppe';
      if (groupDetailsData?.instructions?.custom_social_prompt) {
        noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}"`);
      }
    }

    const hasLoadedKnowledge = availableKnowledge.length > 0;

    if (source.type !== 'neutral' && hasLoadedKnowledge) {
      if (source.type === 'user') {
        noticeParts.push('gesamtes persönliches Wissen');
      } else if (source.type === 'group') {
        noticeParts.push(`gesamtes Wissen der Gruppe "${sourceNameForNotice}"`);
      }
    }
    
    if (deutschlandmodus === true) {
      noticeParts.push("Deutschlandmodus (AWS) aktiv");
    }

    if (noticeParts.length === 0 && source.type === 'neutral') {
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

          formNotice={formNoticeElement}
          enableKnowledgeSelector={true}
          helpContent={helpContent}
          bottomSectionChildren={renderPlatformCheckboxesSection()}
          componentName={componentName}
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