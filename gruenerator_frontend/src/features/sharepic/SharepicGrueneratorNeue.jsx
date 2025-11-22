import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useWatch } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import BaseForm from '../../components/common/Form/BaseForm/BaseForm';
import { FormInput, FormTextarea } from '../../components/common/Form/Input';
import PlatformSelector from '../../components/common/PlatformSelector';
import FileUpload from '../../components/common/FileUpload';
import ErrorBoundary from '../../components/ErrorBoundary';
import useInteractiveAntrag from '../../hooks/useInteractiveAntrag';
import QuestionAnswerSection from '../../components/common/Form/BaseForm/QuestionAnswerSection';
import useSharepicModification from '../../hooks/useSharepicModification';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import { useFormStateStore } from '../../stores';
import useBaseForm from '../../components/common/Form/hooks/useBaseForm';
import SharepicAdvancedControls from './components/SharepicAdvancedControls';
import { FORM_STEPS, SHAREPIC_GENERATOR } from '../../components/utils/constants';

const SharepicGrueneratorNeue = ({ showHeaderFooter = true }) => {
  const componentName = 'sharepic-neue';

  // Sharepic type options for PlatformSelector
  const sharepicTypeOptions = useMemo(() => [
    { value: 'Dreizeilen', label: 'Standard-Sharepic', icon: '📝', subtitle: '3-Zeilen Slogan mit Bild' },
    { value: 'Zitat', label: 'Zitat mit Bild', icon: '💬', subtitle: 'Zitat mit Hintergrundbild' },
    { value: 'Zitat_Pure', label: 'Zitat Pure', icon: '📝', subtitle: 'Reines Text-Zitat' },
    { value: 'Info', label: 'Infopost', icon: '📋', subtitle: 'Strukturierter Informationspost' },
    { value: 'Headline', label: 'Header', icon: '📰', subtitle: 'Große, markante Headlines' }
  ], []);

  // Initialize form with useBaseForm
  const form = useBaseForm({
    defaultValues: {
      type: 'Dreizeilen',
      thema: '',
      details: '',
      // Dreizeilen/Headline fields
      line1: '',
      line2: '',
      line3: '',
      // Zitat fields
      quote: '',
      name: '',
      // Info fields
      header: '',
      subheader: '',
      body: '',
      // Advanced controls (used in RESULT step)
      fontSize: SHAREPIC_GENERATOR.DEFAULT_FONT_SIZE,
      balkenOffset: SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET,
      colorScheme: SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME,
      balkenGruppenOffset: [0, 0],
      sunflowerOffset: [0, 0],
      credit: ''
    },
    shouldUnregister: false,
    generatorType: 'sharepic',
    componentName: componentName,
    endpoint: null, // Custom submission
    features: [],
    tabIndexKey: 'SHAREPIC',
    disableKnowledgeSystem: true
  });

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    errors
  } = form;

  // Watch type for conditional rendering
  const watchType = useWatch({ control, name: 'type', defaultValue: 'Dreizeilen' });

  // Interactive session state
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentAnswers, setCurrentAnswers] = useState({});

  // Handle answer changes from QuestionAnswerSection
  const handleAnswerChange = useCallback((questionId, value) => {
    setCurrentAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  }, []);

  // Generation hooks - use interactive mode with sharepic endpoint
  const {
    initiateSession,
    continueSession,
    loading: interactiveLoading,
    error: interactiveError
  } = useInteractiveAntrag({ baseEndpoint: '/sharepic/experimental' });

  const { modifySharepic, loading: modificationLoading, error: modificationError } = useSharepicModification();

  // Store integration
  const { setGeneratedText } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  // Local state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [currentStep, setCurrentStep] = useState(FORM_STEPS.INPUT);
  const [isImageEditMode, setIsImageEditMode] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Determine if current type needs image upload
  const needsImageUpload = useMemo(() => {
    return watchType === 'Dreizeilen' || watchType === 'Zitat';
  }, [watchType]);

  // Debug: Monitor loading states (only logs on changes)
  useEffect(() => {
    const formStateLoading = useFormStateStore.getState().loading;
    const combinedLoading = formStateLoading || interactiveLoading || modificationLoading || isGeneratingImage;
    console.log('[SharepicGrueneratorNeue] Loading states:', {
      formState: formStateLoading,
      interactive: interactiveLoading,
      modification: modificationLoading,
      imageGen: isGeneratingImage,
      combined: combinedLoading,
      step: currentStep
    });
  }, [interactiveLoading, modificationLoading, isGeneratingImage, currentStep]);

  // Handle file upload
  const handleFileChange = useCallback(async (selectedFile) => {
    try {
      if (selectedFile) {
        // For sharepics, use the original file without WebP conversion
        // The backend canvas library only supports JPEG, PNG, and GIF
        setUploadedImage(selectedFile);
      }
    } catch (error) {
      console.error('[SharepicGrueneratorNeue] Image selection error:', error);
    }
  }, []);

  // Main form submission handler
  const onSubmitRHF = useCallback(async (rhfData) => {
    useFormStateStore.getState().setLoading(true);

    try {
      if (currentStep === FORM_STEPS.INPUT) {
        // Step 1: Initiate interactive session - generates alternatives and returns as question
        console.log('[SharepicGrueneratorNeue] Initiating interactive session');

        const result = await initiateSession({
          thema: rhfData.thema,
          details: rhfData.details || '',
          requestType: rhfData.type,  // 'Dreizeilen', 'Zitat', 'Info', 'Headline'
          locale: 'de-DE'
        });

        if (!result || !result.sessionId) {
          throw new Error('Keine Session-ID empfangen');
        }

        console.log('[SharepicGrueneratorNeue] Session created:', result.sessionId);

        // Store session and questions
        setSessionId(result.sessionId);
        setQuestions(result.questions || []);
        setCurrentStep(FORM_STEPS.QUESTION);
        useFormStateStore.getState().setLoading(false); // Unblock button for question answering
        return;

      } else if (currentStep === FORM_STEPS.QUESTION) {
        // Step 2: User selected slogan - continue session to get selected alternative
        const answerCount = Object.keys(currentAnswers).length;
        console.log(`[QUESTION] Starting with ${answerCount} answer(s):`, currentAnswers);

        // Validate all questions answered
        const allAnswered = questions.every(q => {
          const answer = currentAnswers[q.id];
          return answer !== undefined && answer !== null && answer !== '';
        });

        if (!allAnswered) {
          console.log('[QUESTION] Validation failed - not all questions answered');
          alert('Bitte wähle einen Slogan aus, um fortzufahren.');
          useFormStateStore.getState().setLoading(false);
          return;
        }

        console.log('[QUESTION] Validation passed, calling continueSession...');
        const result = await continueSession(sessionId, currentAnswers);

        if (!result || !result.finalResult) {
          throw new Error('Keine Auswahl empfangen');
        }

        console.log('[SharepicGrueneratorNeue] Selected slogan:', result.finalResult);

        // Populate form with selected slogan
        const selected = result.finalResult;

        if (rhfData.type === 'Zitat' || rhfData.type === 'Zitat_Pure') {
          setValue('quote', selected.quote);
          setValue('name', selected.name || '');
        } else if (rhfData.type === 'Info') {
          setValue('header', selected.header);
          setValue('subheader', selected.subheader);
          setValue('body', selected.body);
        } else {
          setValue('line1', selected.line1);
          setValue('line2', selected.line2);
          setValue('line3', selected.line3);
        }

        setCurrentStep(FORM_STEPS.PREVIEW);

      } else if (currentStep === FORM_STEPS.PREVIEW) {
        // Step 2: Generate image
        if (needsImageUpload && !uploadedImage) {
          throw new Error('Bitte wähle ein Bild aus');
        }

        // Ensure colorScheme is always an array, use default if not present or invalid
        const imageData = needsImageUpload ? {
          ...rhfData,
          colorScheme: Array.isArray(rhfData.colorScheme)
            ? rhfData.colorScheme
            : SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME,
          image: uploadedImage
        } : {
          ...rhfData,
          colorScheme: Array.isArray(rhfData.colorScheme)
            ? rhfData.colorScheme
            : SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME
        };

        setIsGeneratingImage(true);
        let imageResult;
        try {
          imageResult = await generateImage(imageData);

          if (!imageResult) {
            throw new Error('Keine Bilddaten empfangen');
          }
        } finally {
          setIsGeneratingImage(false);
        }

        const generatedContent = {
          sharepic: [{
            image: imageResult,
            type: rhfData.type,
            text: getTextForType(rhfData),
            id: `sharepic-${Date.now()}`,
            createdAt: new Date().toISOString()
          }],
          content: 'sharepic-content'
        };

        setGeneratedText(componentName, generatedContent);
        setCurrentStep(FORM_STEPS.RESULT);
        setShowAlternatives(false);
      } else if (currentStep === FORM_STEPS.RESULT) {
        // Step 3: Modify image with advanced controls
        if (rhfData.type === 'Info' || rhfData.type === 'Zitat_Pure' || rhfData.type === 'Headline') {
          // Regenerate for types without image modification
          const imageDataForRegen = {
            ...rhfData,
            colorScheme: Array.isArray(rhfData.colorScheme)
              ? rhfData.colorScheme
              : SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME
          };
          const imageResult = await generateImage(imageDataForRegen);

          if (!imageResult) {
            throw new Error('Keine Bilddaten empfangen');
          }

          const updatedContent = {
            sharepic: [{
              image: imageResult,
              type: rhfData.type,
              text: getTextForType(rhfData),
              id: storeGeneratedText?.sharepic?.[0]?.id || `sharepic-${Date.now()}`,
              createdAt: new Date().toISOString()
            }],
            content: 'sharepic-content'
          };

          setGeneratedText(componentName, updatedContent);
        } else {
          // Modify image for Dreizeilen and Zitat
          const result = await modifySharepic(
            rhfData,
            {
              fontSize: rhfData.fontSize,
              balkenOffset: rhfData.balkenOffset,
              colorScheme: Array.isArray(rhfData.colorScheme)
                ? rhfData.colorScheme
                : SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME,
              credit: rhfData.credit,
              image: uploadedImage
            }
          );

          if (!result.image) {
            throw new Error('Keine modifizierten Bilddaten empfangen');
          }

          const updatedContent = {
            sharepic: [{
              image: result.image,
              type: rhfData.type,
              text: getTextForType(rhfData),
              id: storeGeneratedText?.sharepic?.[0]?.id || `sharepic-${Date.now()}`,
              createdAt: new Date().toISOString()
            }],
            content: 'sharepic-content'
          };

          setGeneratedText(componentName, updatedContent);
        }
      }
    } catch (error) {
      console.error(`[SharepicGrueneratorNeue] Error in step "${currentStep}":`, error.message || error);
      throw error;
    } finally {
      useFormStateStore.getState().setLoading(false);
    }
  }, [currentStep, needsImageUpload, uploadedImage, initiateSession, continueSession, sessionId, currentAnswers, modifySharepic, setValue, setGeneratedText, storeGeneratedText, componentName]);

  // Helper to get text for sharepic type
  const getTextForType = useCallback((data) => {
    if (data.type === 'Zitat' || data.type === 'Zitat_Pure') {
      return `"${data.quote}" - ${data.name}`;
    } else if (data.type === 'Info') {
      return `${data.header}\n${data.subheader}\n${data.body}`;
    } else {
      return `${data.line1}\n${data.line2}\n${data.line3}`;
    }
  }, []);

  // Handle back button
  const handleBack = useCallback(() => {
    if (currentStep === FORM_STEPS.RESULT) {
      if (window.confirm('Möchtest du wirklich zurück? Das generierte Sharepic geht verloren.')) {
        setCurrentStep(FORM_STEPS.INPUT);
        setGeneratedText(componentName, null);
        setSessionId(null);
        setQuestions([]);
        setCurrentAnswers({});
      }
    } else if (currentStep === FORM_STEPS.PREVIEW) {
      setCurrentStep(FORM_STEPS.QUESTION);
    } else if (currentStep === FORM_STEPS.QUESTION) {
      setCurrentStep(FORM_STEPS.INPUT);
      setSessionId(null);
      setQuestions([]);
      setCurrentAnswers({});
    }
  }, [currentStep, setGeneratedText, componentName]);

  // Handle content change
  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Render conditional fields based on type
  const renderConditionalFields = useCallback(() => {
    if (watchType === 'Zitat' || watchType === 'Zitat_Pure') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {currentStep === FORM_STEPS.INPUT && (
            <>
              <FormInput
                name="thema"
                control={control}
                label="Thema"
                placeholder="z.B. Klimaschutz, Verkehrswende..."
                rules={{ required: 'Thema ist erforderlich' }}
                error={errors.thema?.message}
              />
              <FormTextarea
                name="details"
                control={control}
                label="Details (optional)"
                placeholder="Zusätzliche Informationen zum Thema..."
                rows={3}
              />
            </>
          )}
          {currentStep !== FORM_STEPS.INPUT && (
            <>
              <FormTextarea
                name="quote"
                control={control}
                label="Zitat"
                placeholder="Gib hier das Zitat ein..."
                rules={{ required: 'Zitat ist erforderlich' }}
                error={errors.quote?.message}
                rows={4}
              />
              <FormInput
                name="name"
                control={control}
                label="Name"
                placeholder="Name der zitierten Person"
                rules={{ required: 'Name ist erforderlich' }}
                error={errors.name?.message}
              />
            </>
          )}
        </motion.div>
      );
    } else if (watchType === 'Info') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {currentStep === FORM_STEPS.INPUT && (
            <>
              <FormInput
                name="thema"
                control={control}
                label="Thema"
                placeholder="z.B. Energiewende, Mobilitätswende..."
                rules={{ required: 'Thema ist erforderlich' }}
                error={errors.thema?.message}
              />
              <FormTextarea
                name="details"
                control={control}
                label="Details"
                placeholder="Fakten, Zahlen und wichtige Informationen..."
                rules={{ required: 'Details sind erforderlich' }}
                error={errors.details?.message}
                rows={4}
              />
            </>
          )}
          {currentStep !== FORM_STEPS.INPUT && (
            <>
              <FormInput
                name="header"
                control={control}
                label="Überschrift"
                placeholder="Hauptüberschrift des Infoposts"
                rules={{ required: 'Überschrift ist erforderlich' }}
                error={errors.header?.message}
              />
              <FormInput
                name="subheader"
                control={control}
                label="Untertitel"
                placeholder="Wichtigster Fakt oder Beleg"
                rules={{ required: 'Untertitel ist erforderlich' }}
                error={errors.subheader?.message}
              />
              <FormTextarea
                name="body"
                control={control}
                label="Text"
                placeholder="Haupttext des Infoposts..."
                rules={{ required: 'Text ist erforderlich' }}
                error={errors.body?.message}
                rows={6}
              />
            </>
          )}
        </motion.div>
      );
    } else {
      // Dreizeilen and Headline
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          {currentStep === FORM_STEPS.INPUT && (
            <>
              <FormInput
                name="thema"
                control={control}
                label="Thema"
                placeholder="z.B. Klimaschutz jetzt, Grüne Zukunft..."
                rules={{ required: 'Thema ist erforderlich' }}
                error={errors.thema?.message}
              />
              <FormTextarea
                name="details"
                control={control}
                label="Details (optional)"
                placeholder="Weitere Informationen zum Thema..."
                rows={3}
              />
            </>
          )}
          {currentStep !== FORM_STEPS.INPUT && (
            <>
              <FormInput
                name="line1"
                control={control}
                label="Zeile 1"
                rules={{ required: 'Zeile 1 ist erforderlich' }}
                error={errors.line1?.message}
              />
              <FormInput
                name="line2"
                control={control}
                label="Zeile 2"
                rules={{ required: 'Zeile 2 ist erforderlich' }}
                error={errors.line2?.message}
              />
              <FormInput
                name="line3"
                control={control}
                label="Zeile 3"
                rules={{ required: 'Zeile 3 ist erforderlich' }}
                error={errors.line3?.message}
              />
            </>
          )}
        </motion.div>
      );
    }
  }, [watchType, currentStep, control, errors]);

  // Button labels based on step
  const submitButtonText = useMemo(() => {
    if (currentStep === FORM_STEPS.INPUT) return 'Alternativen generieren';
    if (currentStep === FORM_STEPS.QUESTION) return 'Auswahl bestätigen';
    if (currentStep === FORM_STEPS.PREVIEW) return 'Sharepic erstellen';
    return 'Änderungen übernehmen';
  }, [currentStep]);

  // Help content
  const helpContent = {
    content: 'Erstelle professionelle Sharepics für Social Media. Die KI hilft dir dabei, deine Botschaft optimal zu präsentieren.',
    tips: [
      'Wähle zuerst das Format aus (Standard, Zitat, Info, Header)',
      'Gib ein klares Thema und Details an',
      'Die KI generiert passende Textvorschläge',
      'Bei Bedarf kannst du das Bild und den Text anpassen'
    ]
  };

  // Custom edit content for advanced controls
  const customEditContent = currentStep === FORM_STEPS.RESULT && (
    <SharepicAdvancedControls
      control={control}
      watchType={watchType}
      needsModification={watchType === 'Dreizeilen' || watchType === 'Zitat'}
    />
  );

  // Render sharepic type selector
  const renderSharepicTypeSelector = () => (
    <PlatformSelector
      name="type"
      control={control}
      options={sharepicTypeOptions}
      label="Sharepic-Format"
      placeholder="Format auswählen..."
      isMulti={false}
      required={true}
      enableIcons={false}
      enableSubtitles={true}
      isSearchable={false}
      iconType="function"
    />
  );

  return (
    <ErrorBoundary>
      <div className="sharepic-gruenerator-neue">
        <BaseForm
          title="Sharepic Grünerator"
          onSubmit={handleSubmit(onSubmitRHF)}
          onBack={handleBack}
          loading={interactiveLoading || modificationLoading || isGeneratingImage}
          error={interactiveError || modificationError}
          generatedContent={storeGeneratedText}
          onGeneratedContentChange={handleGeneratedContentChange}
          enableEditMode={true}
          customEditContent={customEditContent}
          onImageEditModeChange={setIsImageEditMode}
          helpContent={helpContent}
          componentName={componentName}
          useFeatureIcons={false}
          showHeader={showHeaderFooter}
          showFooter={showHeaderFooter}
          submitButtonText={submitButtonText}
          showBackButton={currentStep > FORM_STEPS.INPUT}
          firstExtrasChildren={renderSharepicTypeSelector()}
        >
          <AnimatePresence mode="wait">
            {renderConditionalFields()}
          </AnimatePresence>

          {currentStep === FORM_STEPS.QUESTION && questions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <QuestionAnswerSection
                questions={questions}
                answers={currentAnswers}
                onAnswerChange={handleAnswerChange}
                questionRound={1}
              />
            </motion.div>
          )}

          {currentStep === FORM_STEPS.PREVIEW && needsImageUpload && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
            >
              <FileUpload
                handleChange={handleFileChange}
                allowedTypes={['.jpg', '.jpeg', '.png', '.webp']}
                file={uploadedImage}
                loading={interactiveLoading || modificationLoading || isGeneratingImage}
                label="Hintergrundbild"
              />
            </motion.div>
          )}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

SharepicGrueneratorNeue.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default SharepicGrueneratorNeue;
