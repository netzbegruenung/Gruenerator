import React, { useState, useCallback, useMemo, memo } from 'react';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
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
import CorrectionSection from '../../../components/common/Form/BaseForm/CorrectionSection';
import { usePlanModeWorkflow } from '../antrag/hooks/usePlanModeWorkflow';

interface AntragTabProps {
  isActive: boolean;
}

interface FormValues {
  inhalt: string;
  gliederung: string;
}

const REQUEST_TYPES = {
  ANTRAG: 'antrag',
  KLEINE_ANFRAGE: 'kleine_anfrage',
  GROSSE_ANFRAGE: 'grosse_anfrage'
} as const;

const REQUEST_TYPE_LABELS = {
  [REQUEST_TYPES.ANTRAG]: 'Antrag',
  [REQUEST_TYPES.KLEINE_ANFRAGE]: 'Kleine Anfrage',
  [REQUEST_TYPES.GROSSE_ANFRAGE]: 'Große Anfrage'
};

const AntragIcon = memo(() => <Icon category="textTypes" name="antrag" size={16} />);
AntragIcon.displayName = 'AntragIcon';

const KleineAnfrageIcon = memo(() => <Icon category="textTypes" name="kleine_anfrage" size={16} />);
KleineAnfrageIcon.displayName = 'KleineAnfrageIcon';

const GrosseAnfrageIcon = memo(() => <Icon category="textTypes" name="grosse_anfrage" size={16} />);
GrosseAnfrageIcon.displayName = 'GrosseAnfrageIcon';

const REQUEST_TYPE_ICONS: Record<string, () => React.ReactNode> = {
  [REQUEST_TYPES.ANTRAG]: () => <AntragIcon />,
  [REQUEST_TYPES.KLEINE_ANFRAGE]: () => <KleineAnfrageIcon />,
  [REQUEST_TYPES.GROSSE_ANFRAGE]: () => <GrosseAnfrageIcon />
};

const PlanModeIcon = memo(({ className }: { className?: string }) => (
  <Icon category="ui" name="strategy" className={className} />
));
PlanModeIcon.displayName = 'PlanModeIcon';

const AntragTab: React.FC<AntragTabProps> = memo(({ isActive }) => {
  const componentName = 'antrag-generator';

  useUserDefaults('antrag');

  const [selectedRequestType, setSelectedRequestType] = useState<typeof REQUEST_TYPES.ANTRAG | typeof REQUEST_TYPES.KLEINE_ANFRAGE | typeof REQUEST_TYPES.GROSSE_ANFRAGE>(REQUEST_TYPES.ANTRAG);
  const [usePlanMode, setUsePlanMode] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string | string[]>>({});
  const planMode = usePlanModeWorkflow();

  const [antragContent, setAntragContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/antraege/generate-simple');

  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const setup = useGeneratorSetup({
    instructionType: 'antrag',
    componentName: 'antrag-generator'
  });

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
      content: 'Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details.',
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
  const getValues = form.getValues as (name?: string) => unknown;

  const allAttachments = useMemo(() => [
    ...(form.generator?.attachedFiles || [])
  ], [form.generator?.attachedFiles]);

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt', 'gliederung'] as const
  });

  const onSubmitRHF = useCallback(async (rhfData: FormValues) => {
    setStoreIsLoading(true);

    try {
      if (usePlanMode) {
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

      const formDataToSubmit = builder.buildSubmissionData({
        requestType: selectedRequestType,
        inhalt: rhfData.inhalt,
        gliederung: rhfData.gliederung
      });

      const response = await submitForm(formDataToSubmit as unknown as Record<string, unknown>);

      if (response) {
        const content = typeof response === 'string' ? response : (response as { content?: string }).content;
        const metadata = typeof response === 'object' ? (response as { metadata?: Record<string, unknown> }).metadata : undefined;

        if (content) {
          setAntragContent(content);
          setGeneratedText(componentName, content, metadata);
          setTimeout(resetSuccess, 3000);
        }
      }

      setStoreIsLoading(false);
    } catch (submitError) {
      console.error('[AntragTab] Error submitting form:', submitError);
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

  const displayContent = useMemo(() => {
    if (usePlanMode) {
      const { status, plan, revisedPlan, correctedPlan, production } = planMode.state;

      if (status === 'completed' && production) {
        return {
          content: production,
          title: null,
          metadata: {},
          useMarkdown: false
        };
      }

      const showPlanStates = ['plan_generated', 'answering_questions', 'providing_corrections'];
      if (showPlanStates.includes(status) && (plan || revisedPlan || correctedPlan)) {
        const displayPlan = correctedPlan || revisedPlan || plan;
        let planTitle = '📋 Strategischer Plan';
        if (correctedPlan) {
          planTitle = '✏️ Korrigierter Plan';
        } else if (revisedPlan) {
          planTitle = '📝 Verfeinerter Plan';
        }
        return {
          content: `## ${planTitle}\n\n${displayPlan}`,
          title: null,
          metadata: {},
          useMarkdown: true
        };
      }
    }

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

  const handleStartCorrections = useCallback(() => {
    planMode.startCorrections();
  }, [planMode]);

  const handleSubmitCorrections = useCallback(async (corrections: string) => {
    if (planMode.state.workflowId) {
      await planMode.submitCorrections(planMode.state.workflowId, corrections);
    }
  }, [planMode]);

  const handleCancelCorrections = useCallback(() => {
    planMode.cancelCorrections();
  }, [planMode]);

  const isPlanModeActive = usePlanMode && planMode.state.status !== 'idle';
  const showFormInputs = !isPlanModeActive || planMode.state.status === 'error';

  const requestTypeOptions = useMemo(() =>
    Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
      icon: REQUEST_TYPE_ICONS[value]
    })),
    []
  );

  const handleRequestTypeChange = useCallback((value: string | number | (string | number)[] | null | undefined) => {
    // Extract first value if array (shouldn't happen with isMulti=false but type union expects it)
    const val = Array.isArray(value) ? value[0] : value;
    setSelectedRequestType(String(val ?? REQUEST_TYPES.ANTRAG) as typeof REQUEST_TYPES.ANTRAG | typeof REQUEST_TYPES.KLEINE_ANFRAGE | typeof REQUEST_TYPES.GROSSE_ANFRAGE);
  }, []);

  const handlePlanModeToggle = useCallback((checked: boolean) => {
    setUsePlanMode(checked);
    if (!checked) handlePlanModeReset();
  }, [handlePlanModeReset]);

  const renderRequestTypeSection = useCallback(() => (
    <PlatformSelector
      name="requestType"
      options={requestTypeOptions}
      value={selectedRequestType}
      onChange={handleRequestTypeChange}
      label="Art der Anfrage"
      placeholder="Art der Anfrage auswählen..."
      isMulti={false}
      control={undefined}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  ), [requestTypeOptions, selectedRequestType, handleRequestTypeChange]);

  const renderFormInputs = () => {
    return (
      <>
        <FormTextarea
          name="inhalt"
          control={control}
          label="Inhalt"
          placeholder={FORM_PLACEHOLDERS.INHALT}
          rules={{ required: 'Inhalt ist ein Pflichtfeld' }}
          minRows={5}
          maxRows={15}
          className="form-textarea-large"
          tabIndex={(form.generator?.tabIndex as Record<string, unknown>)?.inhalt as number | undefined}
        />

        <SmartInput
          fieldType="gliederung"
          name="gliederung"
          control={control}
          setValue={setValue}
          getValues={getValues}
          label={FORM_LABELS.GLIEDERUNG}
          placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
          tabIndex={(form.generator?.tabIndex as Record<string, unknown>)?.gliederung as number | undefined}
          onSubmitSuccess={success ? String(getValues('gliederung') || '') : null}
          shouldSave={success}
          formName="antrag"
        />
      </>
    );
  };

  const renderPlanModeContent = () => {
    const { status, plan, revisedPlan, correctedPlan, questions, correctionSummary } = planMode.state;

    if (status === 'plan_generated' && (plan || revisedPlan || correctedPlan)) {
      const hasQuestions = questions && questions.length > 0;

      let statusMessage = 'Dein strategischer Plan wurde erstellt. Wie möchtest du fortfahren?';
      if (correctedPlan) {
        statusMessage = correctionSummary
          ? `Der Plan wurde korrigiert (${correctionSummary}). Wie möchtest du fortfahren?`
          : 'Der Plan wurde korrigiert. Wie möchtest du fortfahren?';
      } else if (revisedPlan) {
        statusMessage = 'Der Plan wurde verfeinert. Wie möchtest du fortfahren?';
      }

      return (
        <div className="plan-mode-actions">
          <p style={{ marginBottom: '1rem', color: 'var(--font-color-secondary)' }}>
            {statusMessage}
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
            <button
              type="button"
              className="btn-secondary size-m"
              onClick={handleStartCorrections}
              disabled={planMode.isLoading}
            >
              Plan korrigieren
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

    if (status === 'providing_corrections') {
      return (
        <CorrectionSection
          onSubmit={handleSubmitCorrections}
          onCancel={handleCancelCorrections}
          loading={false}
        />
      );
    }

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

    if (['generating_plan', 'revising_plan', 'applying_corrections', 'generating_production'].includes(status)) {
      let loadingText = getSubmitButtonText();
      if (status === 'applying_corrections') {
        loadingText = 'Korrekturen werden angewendet...';
      }
      return (
        <div className="plan-mode-loading" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: '1rem', color: 'var(--font-color-secondary)' }}>
            {loadingText}
          </p>
        </div>
      );
    }

    return renderFormInputs();
  };

  const renderFirstExtras = useCallback(() => (
    <>
      {renderRequestTypeSection()}
      <FeatureToggle
        label="Plan Mode"
        isActive={usePlanMode}
        onToggle={handlePlanModeToggle}
        icon={PlanModeIcon}
        description="Erst planen, dann generieren"
        noBorder={true}
        disabled={isPlanModeActive}
      />
    </>
  ), [renderRequestTypeSection, usePlanMode, handlePlanModeToggle, isPlanModeActive]);

  return (
    <BaseForm
      {...form.generator?.baseFormProps}
      componentName={componentName}
      enableEditMode={!isPlanModeActive}
      onSubmit={() => {
        const submitHandler = handleSubmit(async (data: unknown) => {
          await onSubmitRHF(data as unknown as FormValues);
        });
        return submitHandler();
      }}
      loading={loading || planMode.isLoading}
      success={success && !usePlanMode}
      error={planMode.state.error || error}
      generatedContent={displayContent?.content || ''}
      useMarkdown={displayContent?.useMarkdown ?? false}
      nextButtonText={getSubmitButtonText()}
      firstExtrasChildren={renderFirstExtras()}
      platformOptions={(form.generator?.baseFormProps?.platformOptions ?? undefined) as unknown as any[] | undefined}
      hideFormExtras={isPlanModeActive && planMode.state.status !== 'idle'}
    >
      {usePlanMode ? renderPlanModeContent() : renderFormInputs()}
    </BaseForm>
  );
});

AntragTab.displayName = 'AntragTab';

export default AntragTab;
