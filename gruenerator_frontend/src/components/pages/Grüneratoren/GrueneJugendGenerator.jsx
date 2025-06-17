import React, { useState, useCallback, useContext, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm, Controller } from 'react-hook-form';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../hooks/useSharedContent';
import StyledCheckbox from '../../common/AnimatedCheckbox';
import { FormContext } from '../../utils/FormContext';
// import { useDynamicTextSize } from '../../utils/commonFunctions';
import ErrorBoundary from '../../ErrorBoundary';
import { useFormFields } from '../../common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import useKnowledge from '../../hooks/useKnowledge';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import { useAuthStore } from '../../../stores/authStore';

const GrueneJugendGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const { user, betaFeatures } = useOptimizedAuth();
  const { memoryEnabled } = useAuthStore();
  const deutschlandmodus = betaFeatures?.deutschlandmodus;

  // Initialize knowledge system
  const instructionType = 'gruenejugend';
  useKnowledge({ instructionType });
  
  // Get knowledge state from store
  const {
    source,
    availableKnowledge,
    isInstructionsActive,
    instructions,
    getKnowledgeContent,
    getActiveInstruction,
    groupData: groupDetailsData
  } = useGeneratorKnowledgeStore();
  
  // Create form notice
  const formNotice = createKnowledgeFormNotice({
    source,
    isLoadingGroupDetails: false, // useKnowledge handles loading
    isInstructionsActive,
    instructions,
    instructionType,
    groupDetailsData,
    availableKnowledge,
    deutschlandmodus
  });

  const platformOptions = useMemo(() => [
    { id: 'instagram', label: 'Instagram' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'messenger', label: 'Messenger' },
    { id: 'reelScript', label: 'Instagram Reel' },
    { id: 'actionIdeas', label: 'Aktionsideen' }
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
    formState: { errors }
  } = useForm({
    defaultValues: {
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      ...defaultPlatforms
    }
  });

  const [socialMediaContent, setSocialMediaContent] = useState('');
  // const textSize = useDynamicTextSize(socialMediaContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_gruene_jugend');
  const { /* setGeneratedContent, */ } = useContext(FormContext);

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);
    try {
      const selectedPlatforms = platformOptions
        .filter(p => rhfData[p.id])
        .map(p => p.id);

      const formDataToSubmit = { 
        thema: rhfData.thema, 
        details: rhfData.details, 
        platforms: selectedPlatforms
      };
      
      // Add knowledge, instructions, and memories
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType,
        groupDetailsData,
        getKnowledgeContent,
        memoryOptions: {
          enableMemories: memoryEnabled,
          query: rhfData.thema,
          generatorType: 'gruenejugend',
          userId: user?.id
        }
      });
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt;
        console.log('[GrueneJugendGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[GrueneJugendGenerator] No custom instructions or knowledge for generation.');
      }

      console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formDataToSubmit);
      const content = await submitForm(formDataToSubmit);
      console.log('[GrueneJugendGenerator] API Antwort erhalten:', content);
      if (content) {
        console.log('[GrueneJugendGenerator] Setze generierten Content:', content.substring(0, 100) + '...');
        setSocialMediaContent(content);
        setGeneratedText(componentName, content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (err) {
      console.error('[GrueneJugendGenerator] Fehler beim Formular-Submit:', err);
    } finally {
      setStoreIsLoading(false);
    }
  }, [submitForm, resetSuccess, /* setGeneratedContent, */ setGeneratedText, setStoreIsLoading, platformOptions, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, memoryEnabled, user?.id]);

  const handleGeneratedContentChange = useCallback((content) => {
    console.log('[GrueneJugendGenerator] Content Change Handler aufgerufen mit:', content?.substring(0, 100) + '...');
    setSocialMediaContent(content);
    setGeneratedText(componentName, content);
  }, [/* setGeneratedContent, */ setGeneratedText, componentName]);

  const helpContent = {
    content: "Dieser Grünerator erstellt jugendgerechte Social Media Inhalte und Aktionsideen speziell für die Grüne Jugend.",
    tips: [
      "Wähle ein aktuelles, jugendrelevantes Thema",
      "Formuliere Details verständlich und ansprechend",
      "TikTok und Instagram sind besonders effektiv für junge Zielgruppen",
      "Aktionsideen helfen bei der praktischen Umsetzung",
      "Instagram Reels erreichen eine große Reichweite"
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
      />
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
          title="Grüne Jugend"
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={socialMediaContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          formNotice={formNotice}
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

GrueneJugendGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default GrueneJugendGenerator; 