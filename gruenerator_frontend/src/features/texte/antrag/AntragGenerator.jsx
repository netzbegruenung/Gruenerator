import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../../components/ErrorBoundary';
import SmartInput from '../../../components/common/Form/SmartInput';
import { HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';
import { createKnowledgeFormNotice } from '../../../utils/knowledgeFormUtils';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useLazyAuth } from '../../../hooks/useAuth';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';
import useInteractiveAntrag from '../../../hooks/useInteractiveAntrag';
import QuestionAnswerSection from '../../../components/common/Form/BaseForm/QuestionAnswerSection';
import { HiChatAlt2 } from 'react-icons/hi';
import FeatureToggle from '../../../components/common/FeatureToggle';

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
  useLazyAuth(); // Establish cached auth state for useKnowledge
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // State for request type - moved outside of form control
  const [selectedRequestType, setSelectedRequestType] = useState(REQUEST_TYPES.ANTRAG);

  // Interactive mode state
  const [useInteractiveMode, setUseInteractiveMode] = useState(false);
  const [interactiveState, setInteractiveState] = useState('initial'); // 'initial' | 'questions' | 'generating' | 'completed'
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentAnswers, setCurrentAnswers] = useState({});
  const [questionRound, setQuestionRound] = useState(0);

  // Interactive API hook
  const { initiateSession, continueSession, loading: interactiveLoading, error: interactiveError } = useInteractiveAntrag();

  // Initialize knowledge system with UI configuration
  useKnowledge({ 
    instructionType: 'antrag', 
    ui: {
      enableKnowledge: true,
      enableDocuments: true,
      enableTexts: true
    }
  });

  // Initialize tabIndex configuration
  const tabIndex = useTabIndex('ANTRAG');
  const baseFormTabIndex = useBaseFormTabIndex('ANTRAG');

  const {
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      idee: '',
      details: '',
      gliederung: '',
      useWebSearchTool: false,
      usePrivacyMode: false,
      useProMode: false
    }
  });

  const watchUseWebSearch = watch('useWebSearchTool');
  const watchUsePrivacyMode = watch('usePrivacyMode');
  const watchUseProMode = watch('useProMode');

  const [antragContent, setAntragContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/antraege/generate-simple');
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  
  // Store integration - all knowledge and instructions from store
  const {
    source,
    availableKnowledge,
    selectedKnowledgeIds,
    selectedDocumentIds,
    selectedTextIds,
    isInstructionsActive,
    instructions,
    getActiveInstruction,
    groupData: groupDetailsData
  } = useGeneratorKnowledgeStore();
  
  // Set default gliederung from user's profile when instructions are loaded
  useEffect(() => {
    if (instructions?.antragGliederung && source.type === 'user') {
      setValue('gliederung', instructions.antragGliederung);
    }
  }, [instructions?.antragGliederung, source.type, setValue]);
  
  // Create form notice
  const formNotice = createKnowledgeFormNotice({
    source,
    isLoadingGroupDetails: false, // useKnowledge handles loading
    isInstructionsActive,
    instructions,
    instructionType: 'antrag',
    groupDetailsData,
    availableKnowledge,
  });

  const onSubmitRHF = useCallback(async (rhfData) => {
    setStoreIsLoading(true);

    try {
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

      // SIMPLE MODE (existing logic unchanged)
      const formDataToSubmit = {
        requestType: selectedRequestType,
        idee: rhfData.idee,
        details: rhfData.details,
        gliederung: rhfData.gliederung,
        useWebSearchTool: rhfData.useWebSearchTool,
        usePrivacyMode: rhfData.usePrivacyMode,
        useBedrock: rhfData.useProMode,
        attachments: processedAttachments
      };

      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.idee) queryParts.push(data.idee);
        if (data.details) queryParts.push(data.details);
        if (data.gliederung) queryParts.push(data.gliederung);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };

      const searchQuery = extractQueryFromFormData(formDataToSubmit);
      const customPrompt = isInstructionsActive && getActiveInstruction
        ? getActiveInstruction('antrag')
        : null;

      formDataToSubmit.customPrompt = customPrompt;
      formDataToSubmit.selectedKnowledgeIds = selectedKnowledgeIds || [];
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
    isInstructionsActive,
    getActiveInstruction,
    processedAttachments,
    selectedRequestType,
    selectedKnowledgeIds,
    selectedDocumentIds,
    selectedTextIds
  ]);

  const handleGeneratedContentChange = useCallback((content) => {
    setAntragContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);


  const handleAttachmentClick = useCallback(async (files) => {
    try {
      console.log(`[AntragGenerator] Processing ${files.length} new attached files`);
      const processed = await prepareFilesForSubmission(files);
      
      // Accumulate files instead of replacing
      setAttachedFiles(prevFiles => [...prevFiles, ...files]);
      setProcessedAttachments(prevProcessed => [...prevProcessed, ...processed]);
      
      console.log('[AntragGenerator] Files successfully processed for submission');
    } catch (error) {
      console.error('[AntragGenerator] File processing error:', error);
      // Here you could show a toast notification or error message to the user
      // For now, we'll just log the error
    }
  }, []);

  const handleRemoveFile = useCallback((index) => {
    console.log(`[AntragGenerator] Removing file at index ${index}`);
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    setProcessedAttachments(prevProcessed => prevProcessed.filter((_, i) => i !== index));
  }, []);


  const helpContent = {
    content: `Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details. Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.`,
    tips: [
      "Wähle die Art: Antrag, Kleine oder Große Anfrage",
      "Kleine Anfragen: Präzise Fachinformationen punktuell abfragen",
      "Große Anfragen: Umfassende politische Themen mit Debatte",
      "Formuliere deine Idee klar und präzise",
      "Nutze die Websuche für aktuelle Informationen"
    ]
  };

  const renderRequestTypeSection = () => {
    const requestTypeOptions = Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: REQUEST_TYPE_ICONS[value]
    }));

    return (
      <div className="request-type-section">
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

        <FeatureToggle
          {...interactiveModeToggle}
          className="interactive-mode-toggle"
        />
      </div>
    );
  };

  const renderFormInputs = () => (
    <>
      {(interactiveState === 'initial' || !useInteractiveMode) && (
        <>
          <Input
            name="idee"
            control={control}
            label={FORM_LABELS.IDEE}
            placeholder={FORM_PLACEHOLDERS.IDEE}
            rules={{ required: 'Idee ist ein Pflichtfeld' }}
            tabIndex={tabIndex.idee}
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
            tabIndex={tabIndex.details}
          />

          <SmartInput
            fieldType="gliederung"
            name="gliederung"
            control={control}
            label={FORM_LABELS.GLIEDERUNG}
            placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
            tabIndex={tabIndex.gliederung}
            onSubmitSuccess={success ? getValues('gliederung') : null}
            shouldSave={success}
            formName="antrag"
          />
        </>
      )}

      {useInteractiveMode && interactiveState === 'questions' && (
        <QuestionAnswerSection
          questions={questions}
          answers={currentAnswers}
          onAnswerChange={(questionId, value) => {
            setCurrentAnswers(prev => ({ ...prev, [questionId]: value }));
          }}
          questionRound={questionRound}
        />
      )}
    </>
  );
  
  const webSearchFeatureToggle = {
    isActive: watchUseWebSearch,
    onToggle: (checked) => {
      setValue('useWebSearchTool', checked);
    },
    label: "Websuche verwenden",
    icon: HiGlobeAlt,
    description: "",
    tabIndex: tabIndex.webSearch
  };

  const privacyModeToggle = {
    isActive: watchUsePrivacyMode,
    onToggle: (checked) => {
      setValue('usePrivacyMode', checked);
    },
    label: "Privacy-Mode",
    icon: HiShieldCheck,
    description: "Verwendet deutsche Server der Netzbegrünung.",
    tabIndex: tabIndex.privacyMode || 13
  };

  const proModeToggle = {
    isActive: watchUseProMode,
    onToggle: (checked) => {
      setValue('useProMode', checked);
    },
    label: "Pro-Mode",
    description: "Nutzt ein fortgeschrittenes Sprachmodell – ideal für komplexere Texte."
  };

  const interactiveModeToggle = {
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
    icon: HiChatAlt2,
    description: "KI stellt Verständnisfragen vor der Generierung"
  };

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
          statusMessage: 'Generiere Antrag...',
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
          title={<span className="gradient-title">{REQUEST_TYPE_TITLES[selectedRequestType] || REQUEST_TYPE_TITLES[REQUEST_TYPES.ANTRAG]}</span>}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading || interactiveLoading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || antragContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          formNotice={formNotice}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          helpContent={helpContent}
          webSearchFeatureToggle={webSearchFeatureToggle}
          useWebSearchFeatureToggle={true}
          privacyModeToggle={privacyModeToggle}
          usePrivacyModeToggle={true}
          proModeToggle={proModeToggle}
          useProModeToggle={true}
          useFeatureIcons={true}
          onAttachmentClick={handleAttachmentClick}
          onRemoveFile={handleRemoveFile}
          attachedFiles={attachedFiles}
          componentName={componentName}
          platformSelectorTabIndex={baseFormTabIndex.platformSelectorTabIndex}
          knowledgeSelectorTabIndex={baseFormTabIndex.knowledgeSelectorTabIndex}
          knowledgeSourceSelectorTabIndex={baseFormTabIndex.knowledgeSourceSelectorTabIndex}
          documentSelectorTabIndex={baseFormTabIndex.documentSelectorTabIndex}
          submitButtonTabIndex={baseFormTabIndex.submitButtonTabIndex}
          submitButtonProps={computedSubmitButtonProps}
          firstExtrasChildren={renderRequestTypeSection()}
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