import React, { useState, useCallback, useContext, useEffect } from 'react';
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

const GrueneJugendGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'gruene-jugend';
  const { initialContent } = useSharedContent();
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const platformOptions = [
    { id: 'instagram', label: 'Instagram' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'messenger', label: 'Messenger' },
    { id: 'reelScript', label: 'Instagram Reel' },
    { id: 'actionIdeas', label: 'Aktionsideen' }
  ];

  const defaultPlatforms = platformOptions.reduce((acc, platformOpt) => {
    acc[platformOpt.id] = initialContent?.platforms?.[platformOpt.id] || 
                           (platformOpt.id === 'instagram' && initialContent?.isFromSharepic) || 
                           (platformOpt.id === 'twitter' && initialContent?.isFromSharepic) || 
                           false;
    return acc;
  }, {});
  
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


  useEffect(() => {
    reset({
      thema: initialContent?.thema || '',
      details: initialContent?.details || '',
      ...defaultPlatforms
    });
  }, [initialContent, reset, defaultPlatforms]);

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);
    try {
      const selectedPlatforms = platformOptions
        .filter(p => rhfData[p.id])
        .map(p => p.id);

      const formData = { 
        thema: rhfData.thema, 
        details: rhfData.details, 
        platforms: selectedPlatforms
      };

      console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formData);
      const content = await submitForm(formData);
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
  }, [submitForm, resetSuccess, /* setGeneratedContent, */ setGeneratedText, setStoreIsLoading, platformOptions]);

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

          helpContent={helpContent}
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