import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../../components/ErrorBoundary';
import SmartInput from '../../../components/common/Form/SmartInput';
import { FormInput, FormTextarea } from '../../../components/common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../../hooks/useUserInstructions';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import useInteractiveAntrag from '../../../hooks/useInteractiveAntrag';
import QuestionAnswerSection from '../../../components/common/Form/BaseForm/QuestionAnswerSection';
import { HiAnnotation } from 'react-icons/hi';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';

const REQUEST_TYPES = {
  ANTRAG: 'antrag',
  KLEINE_ANFRAGE: 'kleine_anfrage',
  GROSSE_ANFRAGE: 'grosse_anfrage'
};

const REQUEST_TYPE_LABELS = {
  [REQUEST_TYPES.ANTRAG]: 'Antrag',
  [REQUEST_TYPES.KLEINE_ANFRAGE]: 'Kleine Anfrage',
  [REQUEST_TYPES.GROSSE_ANFRAGE]: 'Große Anfrage'
};

const REQUEST_TYPE_ICONS = {
  [REQUEST_TYPES.ANTRAG]: () => <Icon category="textTypes" name="antrag" size={16} />,
  [REQUEST_TYPES.KLEINE_ANFRAGE]: () => <Icon category="textTypes" name="kleine_anfrage" size={16} />,
  [REQUEST_TYPES.GROSSE_ANFRAGE]: () => <Icon category="textTypes" name="grosse_anfrage" size={16} />
};

const REQUEST_TYPE_TITLES = {
  [REQUEST_TYPES.ANTRAG]: 'Grünerator für Anträge',
  [REQUEST_TYPES.KLEINE_ANFRAGE]: 'Grünerator für Kleine Anfragen',
  [REQUEST_TYPES.GROSSE_ANFRAGE]: 'Grünerator für Große Anfragen'
};

const AntragGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'antrag-generator';

  // Beta features check
  const { canAccessBetaFeature } = useBetaFeatures();
  const interactiveAntragEnabled = canAccessBetaFeature('interactiveAntrag');

  // State for request type - moved outside of form control
  const [selectedRequestType, setSelectedRequestType] = useState(REQUEST_TYPES.ANTRAG);

  // Interactive mode state - enabled by default
  const [useInteractiveMode, setUseInteractiveMode] = useState(true);
  const [interactiveState, setInteractiveState] = useState('initial'); // 'initial' | 'questions' | 'generating' | 'completed'
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentAnswers, setCurrentAnswers] = useState({});
  const [questionRound, setQuestionRound] = useState(0);

  // Interactive API hook
  const { initiateSession, continueSession, loading: interactiveLoading, error: interactiveError } = useInteractiveAntrag();

  // Custom content state for interactive mode
  const [antragContent, setAntragContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/antraege/generate-simple');
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Get feature state and selection from store
  // Use proper selectors for reactive subscriptions
  const getFeatureState = useGeneratorSelectionStore(state => state.getFeatureState);
  const selectedDocumentIds = useGeneratorSelectionStore(state => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore(state => state.selectedTextIds);
  const isInstructionsActive = useGeneratorSelectionStore(state => state.isInstructionsActive);

  // Fetch user's custom instructions
  const customPrompt = useUserInstructions('antrag', isInstructionsActive);

  // Initialize useBaseForm with knowledge system enabled
  const form = useBaseForm({
    defaultValues: {
      idee: '',
      details: '',
      gliederung: ''
    },
    generatorType: 'antrag',
    componentName: componentName,
    endpoint: '/antraege/generate-simple',
    instructionType: 'antrag',
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'ANTRAG',
    defaultMode: 'pro',
    helpContent: {
      content: `Interaktiver Modus! Die KI stellt dir 6 kurze Fragen, um deinen Antrag besser zu verstehen. So entstehen passgenauere Ergebnisse.`,
      tips: [
        "Beantworte die Quiz-artigen Fragen mit einem Klick",
        "Die KI nutzt deine Antworten für ein maßgeschneidertes Ergebnis",
        "Du kannst den interaktiven Modus jederzeit ausschalten"
      ],
      isNewFeature: true,
      featureId: 'interactive-antrag-v1',
      fallbackContent: `Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details. Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.`,
      fallbackTips: [
        "Wähle die Art: Antrag, Kleine oder Große Anfrage",
        "Kleine Anfragen: Präzise Fachinformationen punktuell abfragen",
        "Große Anfragen: Umfassende politische Themen mit Debatte",
        "Formuliere deine Idee klar und präzise",
        "Nutze die Websuche für aktuelle Informationen"
      ]
    }
  });

  const { control, handleSubmit, getValues, setValue } = form;

  // Disable interactive mode if beta feature is disabled
  useEffect(() => {
    if (!interactiveAntragEnabled && useInteractiveMode) {
      setUseInteractiveMode(false);
      setInteractiveState('initial');
      setSessionId(null);
      setQuestions([]);
      setCurrentAnswers({});
      setQuestionRound(0);
    }
  }, [interactiveAntragEnabled, useInteractiveMode]);

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    try {
      // Get current feature toggle state from store
      const features = getFeatureState();

      // INTERACTIVE MODE
      if (useInteractiveMode) {
        // Phase 1: Initial submission → Get questions
        if (interactiveState === 'initial') {
          const result = await initiateSession({
            thema: rhfData.idee,
            details: rhfData.details,
            requestType: selectedRequestType,
            locale: 'de-DE'
          });

          setSessionId(result.sessionId);
          setQuestions(result.questions);
          setQuestionRound(result.questionRound);
          setInteractiveState('questions');
          setStoreIsLoading(false);
          return;
        }

        // Phase 2: Submit answers → Get follow-ups or final result
        if (interactiveState === 'questions') {
          // Validate all questions answered - handle both string and array answers
          const allAnswered = questions.every(q => {
            const answer = currentAnswers[q.id];

            // Handle array answers (multi-select questions)
            if (Array.isArray(answer)) {
              return answer.length > 0;
            }

            // Handle string answers (single-select and yes/no questions)
            return answer && typeof answer === 'string' && answer.trim().length > 0;
          });

          if (!allAnswered) {
            alert('Bitte beantworte alle Fragen, um fortzufahren.');
            setStoreIsLoading(false);
            return;
          }

          setInteractiveState('generating');
          const result = await continueSession(sessionId, currentAnswers);

          if (result.status === 'follow_up') {
            // More questions needed
            setQuestions(result.questions);
            setQuestionRound(result.questionRound);
            setCurrentAnswers({});
            setInteractiveState('questions');
          } else if (result.status === 'completed') {
            // Final result ready
            const content = result.finalResult;
            setAntragContent(content);
            setGeneratedText(componentName, content, result.metadata);
            setInteractiveState('completed');
            setTimeout(resetSuccess, 3000);
          }

          setStoreIsLoading(false);
          return;
        }
      }

      // SIMPLE MODE
      const formDataToSubmit = {
        requestType: selectedRequestType,
        idee: rhfData.idee,
        details: rhfData.details,
        gliederung: rhfData.gliederung,
        ...features, // Add feature toggles from store: useWebSearchTool, usePrivacyMode, useBedrock
        attachments: form.generator.attachedFiles
      };

      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.idee) queryParts.push(data.idee);
        if (data.details) queryParts.push(data.details);
        if (data.gliederung) queryParts.push(data.gliederung);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };

      const searchQuery = extractQueryFromFormData(formDataToSubmit);

      // Add custom prompt from user instructions (simplified)
      formDataToSubmit.customPrompt = customPrompt;
      formDataToSubmit.selectedDocumentIds = selectedDocumentIds || [];
      formDataToSubmit.selectedTextIds = selectedTextIds || [];
      formDataToSubmit.searchQuery = searchQuery || '';

      const response = await submitForm(formDataToSubmit);
      if (response) {
        const content = typeof response === 'string' ? response : response.content;
        const metadata = typeof response === 'object' ? response.metadata : {};

        if (content) {
          setAntragContent(content);
          setGeneratedText(componentName, content, metadata);
          setTimeout(resetSuccess, 3000);
        }
      }
    } catch (submitError) {
      console.error('[AntragGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [
    useInteractiveMode,
    interactiveState,
    sessionId,
    currentAnswers,
    questions,
    initiateSession,
    continueSession,
    submitForm,
    resetSuccess,
    setGeneratedText,
    setStoreIsLoading,
    componentName,
    customPrompt,
    form.generator,
    selectedRequestType,
    selectedDocumentIds,
    selectedTextIds,
    getFeatureState
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setAntragContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const renderRequestTypeSection = () => {
    const requestTypeOptions = Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: REQUEST_TYPE_ICONS[value]
    }));

    return (
      <PlatformSelector
        name="requestType"
        options={requestTypeOptions}
        value={selectedRequestType}
        onChange={setSelectedRequestType}
        label="Art der Anfrage"
        placeholder="Art der Anfrage auswählen..."
        isMulti={false}
        control={null}
        enableIcons={true}
        enableSubtitles={false}
        isSearchable={false}
        required={true}
      />
    );
  };

  const renderFormInputs = () => (
    <>
      {(interactiveState === 'initial' || interactiveState === 'completed' || !useInteractiveMode) && (
        <>
          <FormInput
            name="idee"
            control={control}
            label={FORM_LABELS.IDEE}
            placeholder={FORM_PLACEHOLDERS.IDEE}
            rules={{ required: 'Idee ist ein Pflichtfeld' }}
            tabIndex={form.generator.tabIndex.idee}
          />

          <FormTextarea
            name="details"
            control={control}
            label={FORM_LABELS.DETAILS}
            placeholder={FORM_PLACEHOLDERS.DETAILS}
            rules={{ required: 'Details sind ein Pflichtfeld' }}
            minRows={3}
            maxRows={10}
            className="form-textarea-large"
            tabIndex={form.generator.tabIndex.details}
          />

          <SmartInput
            fieldType="gliederung"
            name="gliederung"
            control={control}
            setValue={setValue}
            getValues={getValues}
            label={FORM_LABELS.GLIEDERUNG}
            placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
            tabIndex={form.generator.tabIndex.gliederung}
            onSubmitSuccess={success ? getValues('gliederung') : null}
            shouldSave={success}
            formName="antrag"
          />
        </>
      )}

      {interactiveAntragEnabled && useInteractiveMode && interactiveState === 'questions' && (
        <QuestionAnswerSection
          questions={questions}
          answers={currentAnswers}
          onAnswerChange={(questionId, value) => {
            setCurrentAnswers(prev => ({ ...prev, [questionId]: value }));
          }}
          questionRound={questionRound}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading || interactiveLoading}
          success={success}
          submitButtonProps={computedSubmitButtonProps}
        />
      )}
    </>
  );

  // Interactive mode toggle - only available if beta feature is enabled
  const interactiveModeToggle = useMemo(() => {
    if (!interactiveAntragEnabled) return null;

    return {
      isActive: useInteractiveMode,
      onToggle: (checked) => {
        setUseInteractiveMode(checked);
        // Reset state when toggling
        if (!checked) {
          setInteractiveState('initial');
          setSessionId(null);
          setQuestions([]);
          setCurrentAnswers({});
          setQuestionRound(0);
        }
      },
      label: "Interaktiver Modus",
      icon: HiAnnotation,
      description: "KI stellt Verständnisfragen vor der Generierung"
    };
  }, [interactiveAntragEnabled, useInteractiveMode]);

  // Compute submit button text based on interactive state
  const computedSubmitButtonProps = useMemo(() => {
    if (!useInteractiveMode) {
      return {}; // Use default "Grünerieren"
    }

    switch (interactiveState) {
      case 'initial':
        return { defaultText: 'Grünerieren' };
      case 'questions':
        return {
          defaultText: 'Fragen beantworten',
          statusMessage: 'Verarbeite Antworten...'
        };
      case 'generating':
        return {
          defaultText: 'Grünerieren',
          statusMessage: 'Grüneriere Antrag...',
          showStatus: true
        };
      case 'completed':
        return { defaultText: 'Grünerieren' };
      default:
        return {};
    }
  }, [useInteractiveMode, interactiveState]);

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator.baseFormProps}
          enableEditMode={true}
          title={<span className="gradient-title">{REQUEST_TYPE_TITLES[selectedRequestType] || REQUEST_TYPE_TITLES[REQUEST_TYPES.ANTRAG]}</span>}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading || interactiveLoading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || antragContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          interactiveModeToggle={interactiveModeToggle}
          useInteractiveModeToggle={interactiveAntragEnabled}
          submitButtonProps={computedSubmitButtonProps}
          firstExtrasChildren={renderRequestTypeSection()}
          hideFormExtras={useInteractiveMode && interactiveState === 'questions'}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

AntragGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default AntragGenerator;