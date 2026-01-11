import React, { useState, useCallback, useEffect, useMemo } from 'react';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import ErrorBoundary from '../../../components/ErrorBoundary';
import SmartInput from '../../../components/common/Form/SmartInput';
import { FormTextarea } from '../../../components/common/Form/Input';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import { PlanModeWorkflow, PlanModeToggle } from '../../../components/common/PlanMode';
import { HiAnnotation } from 'react-icons/hi';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useUserDefaults } from '../../../hooks/useUserDefaults';
import type { HelpContent } from '../../../types/baseform';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';

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

const AntragGenerator: React.FC<AntragGeneratorProps> = ({ showHeaderFooter = true }) => {
  const componentName = 'antrag-generator';

  // User defaults for persistent preferences
  const userDefaults = useUserDefaults('antrag');

  // State for request type - moved outside of form control
  const [selectedRequestType, setSelectedRequestType] = useState(REQUEST_TYPES.ANTRAG);

  // Plan Mode state - initialized from user defaults
  const [usePlanMode, setUsePlanMode] = useState<boolean>(
    () => userDefaults.get('planMode', false) as boolean
  );

  // Sync state when user defaults hydrate from backend
  useEffect(() => {
    if (userDefaults.isHydrated) {
      const stored = userDefaults.get('planMode', false) as boolean;
      setUsePlanMode(stored);
    }
  }, [userDefaults.isHydrated]);

  // Custom content state for interactive mode
  const [antragContent, setAntragContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/antraege/generate-simple');
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
      content: 'Plan-Modus! Die KI erstellt zuerst einen strategischen Plan, stellt bei Bedarf Verständnisfragen, und generiert dann basierend auf dem genehmigten Plan.',
      tips: [
        'KI erstellt strategischen Plan für deinen Antrag',
        'Bei Unklarheiten: KI stellt gezielte Fragen',
        'Du genehmigst den finalen Plan vor der Generierung',
        'Ermöglicht präzisere und durchdachtere Anträge'
      ],
      isNewFeature: true,
      featureId: 'plan-mode-antrag-v1',
      fallbackContent: 'Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details. Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.',
      fallbackTips: [
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
      // STANDARD MODE (Plan Mode handled by PlanModeWorkflow component)
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
    } catch (submitError) {
      console.error('[AntragGenerator] Error submitting form:', submitError);
    } finally {
      setStoreIsLoading(false);
    }
  }, [
    submitForm,
    resetSuccess,
    setGeneratedText,
    setStoreIsLoading,
    componentName,
    selectedRequestType,
    builder
  ]);

  const handleGeneratedContentChange = useCallback((content: string) => {
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
        control={undefined}
        enableIcons={true}
        enableSubtitles={false}
        isSearchable={false}
        required={true}
      />
    );
  };

  const handlePlanModeComplete = useCallback((result: any) => {
    const content = result.content || result;
    setAntragContent(content);
    setGeneratedText(componentName, content, result.metadata);
    setUsePlanMode(false); // Return to standard mode after generation
  }, [setGeneratedText, componentName]);

  const renderFormInputs = () => {
    // Plan Mode: Show PlanModeWorkflow
    if (usePlanMode) {
      const formData = getValues() as FormValues;
      return (
        <PlanModeWorkflow
          generatorType="antrag"
          formData={{
            inhalt: formData.inhalt,
            requestType: selectedRequestType,
            gliederung: formData.gliederung
          }}
          onComplete={handlePlanModeComplete}
          enablePlatformSelection={false}
        />
      );
    }

    // Standard Mode: Show regular form inputs
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

  // Plan Mode toggle
  const planModeToggleComponent = useMemo(() => {
    if (!usePlanMode) {
      return (
        <PlanModeToggle
          isActive={usePlanMode}
          onToggle={(checked: boolean) => {
            setUsePlanMode(checked);
            userDefaults.set('planMode', checked);
          }}
        />
      );
    }
    return null; // Hide toggle when Plan Mode is active
  }, [usePlanMode, userDefaults]);

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          {...form.generator?.baseFormProps}
          componentName={componentName}
          enableEditMode={true}
          title={<span className="gradient-title">{REQUEST_TYPE_TITLES[selectedRequestType] || REQUEST_TYPE_TITLES[REQUEST_TYPES.ANTRAG]}</span>}
          onSubmit={() => handleSubmit((data: Record<string, unknown>) => onSubmitRHF(data as unknown as FormValues))()}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || antragContent}
          firstExtrasChildren={
            <>
              {renderRequestTypeSection()}
              {planModeToggleComponent}
            </>
          }
          hideFormExtras={usePlanMode}
          platformOptions={form.generator?.baseFormProps?.platformOptions ?? undefined}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

export default AntragGenerator;
