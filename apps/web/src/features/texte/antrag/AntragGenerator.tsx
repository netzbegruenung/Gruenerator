import React, { useState, useCallback, useMemo } from 'react';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../../components/ErrorBoundary';
import SmartInput from '../../../components/common/Form/SmartInput';
import { FormTextarea } from '../../../components/common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useUserDefaults } from '../../../hooks/useUserDefaults';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import FeatureToggle from '../../../components/common/FeatureToggle';
import QuestionAnswerSection from '../../../components/common/Form/BaseForm/QuestionAnswerSection';
import { usePlanModeWorkflow } from './hooks/usePlanModeWorkflow';

interface AntragGeneratorProps {
  showHeaderFooter?: boolean;
}

interface FormValues {
  inhalt: string;
  gliederung: string;
}

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
  [REQUEST_TYPES.ANTRAG]: 'Welchen Antrag willst du heute grünerieren?',
  [REQUEST_TYPES.KLEINE_ANFRAGE]: 'Welche Kleine Anfrage willst du heute grünerieren?',
  [REQUEST_TYPES.GROSSE_ANFRAGE]: 'Welche Große Anfrage willst du heute grünerieren?'
};

const PlanModeIcon = ({ className }: { className?: string }) => (
  <Icon category="ui" name="strategy" className={className} />
);

const AntragGenerator: React.FC<AntragGeneratorProps> = ({ showHeaderFooter = true }) => {
  const componentName = 'antrag-generator';

  // User defaults for persistent preferences
  const userDefaults = useUserDefaults('antrag');

  // State for request type - moved outside of form control
  const [selectedRequestType, setSelectedRequestType] = useState(REQUEST_TYPES.ANTRAG);

  // Plan Mode state
  const [usePlanMode, setUsePlanMode] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string | string[]>>({});
  const planMode = usePlanModeWorkflow();

  // Custom content state for interactive mode
  const [antragContent, setAntragContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error} = useApiSubmit('/antraege/generate-simple');

  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  // Consolidated setup using new hook
  const setup = useGeneratorSetup({
    instructionType: 'antrag',
    componentName: 'antrag-generator'
  });

  // Initialize useBaseForm with knowledge system enabled
  const form = useBaseForm({
    defaultValues: {
      inhalt: '',
      gliederung: ''
    },
    generatorType: 'antrag' as unknown as null,
    componentName: componentName as unknown as null,
    endpoint: '/antraege/generate-simple' as unknown as null,
    instructionType: 'antrag' as unknown as null,
    features: ['webSearch', 'privacyMode'] as unknown as never[],
    tabIndexKey: 'ANTRAG' as unknown as null,
    defaultMode: 'pro' as unknown as null,
    helpContent: {
      content: 'Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details. Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.',
      tips: [
        'Wähle die Art: Antrag, Kleine oder Große Anfrage',
        'Kleine Anfragen: Präzise Fachinformationen punktuell abfragen',
        'Große Anfragen: Umfassende politische Themen mit Debatte',
        'Formuliere deine Idee klar und präzise',
        'Nutze die Websuche für aktuelle Informationen'
      ]
    } as unknown as null
  });

  const { control, handleSubmit, setValue } = form;
  // Cast getValues to typed version
  const getValues = form.getValues as (name?: string) => unknown;

  // Combine file attachments (no URL crawling in this generator)
  const allAttachments = useMemo(() => [
    ...(form.generator?.attachedFiles || [])
  ], [form.generator?.attachedFiles]);

  // Form data builder with all attachments
  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt', 'gliederung'] as const
  });

  const onSubmitRHF = useCallback(async (rhfData: FormValues) => {
    setStoreIsLoading(true);

    try {
      if (usePlanMode) {
        // Plan Mode: Initiate workflow
        const submissionData = builder.buildSubmissionData({
          requestType: selectedRequestType,
          inhalt: rhfData.inhalt,
          gliederung: rhfData.gliederung
        });

        await planMode.initiatePlan({
          generatorType: 'antrag',
          inhalt: rhfData.inhalt,
          requestType: selectedRequestType,
          useWebSearch: submissionData.useWebSearchTool,
          usePrivacyMode: submissionData.usePrivacyMode,
          selectedDocumentIds: submissionData.selectedDocumentIds,
          selectedTextIds: submissionData.selectedTextIds
        });

        setStoreIsLoading(false);
        return;
      }

      // Standard Mode: Direct generation
      const formDataToSubmit = builder.buildSubmissionData({
        requestType: selectedRequestType,
        inhalt: rhfData.inhalt,
        gliederung: rhfData.gliederung
      });

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

      setStoreIsLoading(false);
    } catch (submitError) {
      console.error('[AntragGenerator] Error submitting form:', submitError);
      setStoreIsLoading(false);
    }
  }, [
    submitForm,
    resetSuccess,
    setGeneratedText,
    setStoreIsLoading,
    componentName,
    selectedRequestType,
    builder,
    usePlanMode,
    planMode
  ]);

  const handleGeneratedContentChange = useCallback((content: string) => {
    setAntragContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  // Compute what content to show in DisplaySection
  const displayContent = useMemo(() => {
    // Plan Mode: Show plan in display section during plan_generated or answering_questions
    if (usePlanMode) {
      const { status, plan, revisedPlan, production } = planMode.state;

      // Completed - show production content
      if (status === 'completed' && production) {
        return {
          content: production,
          title: null,
          metadata: {},
          useMarkdown: false
        };
      }

      // Plan generated or answering questions - show the plan
      if ((status === 'plan_generated' || status === 'answering_questions') && (plan || revisedPlan)) {
        const displayPlan = revisedPlan || plan;
        const planTitle = revisedPlan ? '📝 Verfeinerter Plan' : '📋 Strategischer Plan';
        return {
          content: `## ${planTitle}\n\n${displayPlan}`,
          title: null,
          metadata: {},
          useMarkdown: true
        };
      }
    }

    // Standard mode content
    const content = storeGeneratedText || antragContent;

    if (content) {
      return {
        content,
        title: null,
        metadata: {},
        useMarkdown: false
      };
    }

    return null;
  }, [storeGeneratedText, antragContent, usePlanMode, planMode.state]);

  // Plan Mode helpers
  const getSubmitButtonText = useCallback(() => {
    if (!usePlanMode) return 'Grünerieren';

    switch (planMode.state.status) {
      case 'idle': return 'Plan erstellen';
      case 'generating_plan': return 'Plan wird erstellt...';
      case 'revising_plan': return 'Plan wird verfeinert...';
      case 'generating_production': return 'Wird generiert...';
      default: return 'Grünerieren';
    }
  }, [usePlanMode, planMode.state.status]);

  const handleAnswerChange = useCallback((questionId: string, answer: string | string[]) => {
    setQuestionAnswers(prev => ({ ...prev, [questionId]: answer }));
  }, []);

  const handleQuestionSubmit = useCallback(async () => {
    if (planMode.state.workflowId) {
      await planMode.submitAnswers(planMode.state.workflowId, questionAnswers);
    }
  }, [planMode, questionAnswers]);

  const handleGenerateProduction = useCallback(async () => {
    if (planMode.state.workflowId) {
      await planMode.generateProduction(planMode.state.workflowId);
    }
  }, [planMode]);

  const handleRequestQuestions = useCallback(() => {
    planMode.startAnswering();
  }, [planMode]);

  const handlePlanModeReset = useCallback(() => {
    planMode.reset();
    setQuestionAnswers({});
  }, [planMode]);

  // Determine if we're in a Plan Mode phase that should hide the form
  const isPlanModeActive = usePlanMode && planMode.state.status !== 'idle';
  const showFormInputs = !isPlanModeActive || planMode.state.status === 'error';

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
        control={undefined}
        enableIcons={true}
        enableSubtitles={false}
        isSearchable={false}
        required={true}
      />
    );
  };

  const renderFormInputs = () => {
    return (
      <>
        <FormTextarea
          name="inhalt"
          control={control}
          placeholder={FORM_PLACEHOLDERS.INHALT}
          rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
          minRows={5}
          maxRows={15}
          className="form-textarea-large"
          tabIndex={form.generator?.tabIndex?.inhalt}
        />

        <SmartInput
          fieldType="gliederung"
          name="gliederung"
          control={control}
          setValue={setValue}
          getValues={getValues}
          label={FORM_LABELS.GLIEDERUNG}
          placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
          tabIndex={form.generator?.tabIndex?.gliederung}
          onSubmitSuccess={success ? String(getValues('gliederung') || '') : null}
          shouldSave={success}
          formName="antrag"
        />
      </>
    );
  };

  const renderPlanModeContent = () => {
    const { status, plan, revisedPlan, questions } = planMode.state;

    // Plan Generated - Show action buttons only (plan is shown in display section)
    if (status === 'plan_generated' && (plan || revisedPlan)) {
      const hasQuestions = questions && questions.length > 0;
      return (
        <div className="plan-mode-actions">
          <p style={{ marginBottom: '1rem', color: 'var(--font-color-secondary)' }}>
            {revisedPlan
              ? 'Der Plan wurde verfeinert. Wie möchtest du fortfahren?'
              : 'Dein strategischer Plan wurde erstellt. Wie möchtest du fortfahren?'
            }
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-primary size-m"
              onClick={handleGenerateProduction}
              disabled={planMode.isLoading}
            >
              Jetzt generieren
            </button>
            {hasQuestions && (
              <button
                type="button"
                className="btn-secondary size-m"
                onClick={handleRequestQuestions}
                disabled={planMode.isLoading}
              >
                Fragen beantworten
              </button>
            )}
            <button
              type="button"
              className="btn-ghost size-m"
              onClick={handlePlanModeReset}
              disabled={planMode.isLoading}
            >
              Neu starten
            </button>
          </div>
        </div>
      );
    }

    // Answering Questions - Use existing QuestionAnswerSection (plan visible in display section)
    if (status === 'answering_questions' && questions && questions.length > 0) {
      return (
        <QuestionAnswerSection
          questions={questions}
          answers={questionAnswers}
          onAnswerChange={handleAnswerChange}
          onSubmit={handleQuestionSubmit}
          loading={planMode.state.status === 'revising_plan'}
          submitButtonProps={{ defaultText: 'Plan verfeinern' }}
        />
      );
    }

    // Loading states
    if (['generating_plan', 'revising_plan', 'generating_production'].includes(status)) {
      return (
        <div className="plan-mode-loading" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: '1rem', color: 'var(--font-color-secondary)' }}>
            {getSubmitButtonText()}
          </p>
        </div>
      );
    }

    // Default: Show form inputs
    return renderFormInputs();
  };

  const renderFirstExtras = () => (
    <>
      {renderRequestTypeSection()}
      <FeatureToggle
        label="Plan Mode"
        isActive={usePlanMode}
        onToggle={(checked) => {
          setUsePlanMode(checked);
          if (!checked) handlePlanModeReset();
        }}
        icon={PlanModeIcon}
        description="Erst planen, dann generieren"
        noBorder={true}
        disabled={isPlanModeActive}
      />
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator?.baseFormProps}
          componentName={componentName}
          enableEditMode={!isPlanModeActive}
          title={displayContent?.title ? (
            <span className="gradient-title">{displayContent.title}</span>
          ) : (
            <span className="gradient-title">
              {REQUEST_TYPE_TITLES[selectedRequestType] || REQUEST_TYPE_TITLES[REQUEST_TYPES.ANTRAG]}
            </span>
          )}
          onSubmit={() => handleSubmit((data: Record<string, unknown>) => onSubmitRHF(data as unknown as FormValues))()}
          loading={loading || planMode.isLoading}
          success={success && !usePlanMode}
          error={planMode.state.error || error}
          generatedContent={displayContent?.content || ''}
          useMarkdown={displayContent?.useMarkdown ?? false}
          nextButtonText={getSubmitButtonText()}
          firstExtrasChildren={renderFirstExtras()}
          platformOptions={form.generator?.baseFormProps?.platformOptions ?? undefined}
          hideFormExtras={isPlanModeActive && planMode.state.status !== 'idle'}
        >
          {usePlanMode ? renderPlanModeContent() : renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default AntragGenerator;
