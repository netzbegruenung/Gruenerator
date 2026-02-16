import React, { useState, useCallback, useMemo, memo } from 'react';

import BaseForm from '../../../components/common/BaseForm';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { FormTextarea } from '../../../components/common/Form/Input';
import SmartInput from '../../../components/common/Form/SmartInput';
import Icon from '../../../components/common/Icon';
import PlatformSelector from '../../../components/common/PlatformSelector';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useUserDefaults } from '../../../hooks/useUserDefaults';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

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
  GROSSE_ANFRAGE: 'grosse_anfrage',
} as const;

const REQUEST_TYPE_LABELS = {
  [REQUEST_TYPES.ANTRAG]: 'Antrag',
  [REQUEST_TYPES.KLEINE_ANFRAGE]: 'Kleine Anfrage',
  [REQUEST_TYPES.GROSSE_ANFRAGE]: 'Große Anfrage',
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
  [REQUEST_TYPES.GROSSE_ANFRAGE]: () => <GrosseAnfrageIcon />,
};

const EMPTY_ARRAY: unknown[] = [];

const AntragTab: React.FC<AntragTabProps> = memo(({ isActive }) => {
  const componentName = 'antrag-generator';

  useUserDefaults('antrag');

  const [selectedRequestType, setSelectedRequestType] = useState<
    | typeof REQUEST_TYPES.ANTRAG
    | typeof REQUEST_TYPES.KLEINE_ANFRAGE
    | typeof REQUEST_TYPES.GROSSE_ANFRAGE
  >(REQUEST_TYPES.ANTRAG);

  const [antragContent, setAntragContent] = useState('');
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit(
    '/antraege/generate-simple'
  );

  const storeGeneratedText = useGeneratedTextStore((state) =>
    state.getGeneratedText(componentName)
  );
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

  const setup = useGeneratorSetup({
    instructionType: 'antrag',
    componentName: 'antrag-generator',
  });

  const form = useBaseForm({
    defaultValues: {
      inhalt: '',
      gliederung: '',
    },
    generatorType: 'antrag' as unknown as null,
    componentName: componentName as unknown as null,
    endpoint: '/antraege/generate-simple' as unknown as null,
    instructionType: 'antrag' as unknown as null,
    features: ['webSearch', 'privacyMode'] as unknown as never[],
    tabIndexKey: 'ANTRAG' as unknown as null,
    defaultMode: 'pro' as unknown as null,
    helpContent: {
      content:
        'Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details.',
      tips: [
        'Wähle die Art: Antrag, Kleine oder Große Anfrage',
        'Kleine Anfragen: Präzise Fachinformationen punktuell abfragen',
        'Große Anfragen: Umfassende politische Themen mit Debatte',
        'Formuliere deine Idee klar und präzise',
        'Nutze die Websuche für aktuelle Informationen',
      ],
    } as unknown as null,
  });

  const { control, handleSubmit, setValue } = form;
  const getValues = form.getValues as (name?: string) => unknown;

  const allAttachments = form.generator?.attachedFiles ?? EMPTY_ARRAY;

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: ['inhalt', 'gliederung'] as const,
  });

  const onSubmitRHF = useCallback(
    async (rhfData: FormValues) => {
      setStoreIsLoading(true);

      try {
        const formDataToSubmit = builder.buildSubmissionData({
          requestType: selectedRequestType,
          inhalt: rhfData.inhalt,
          gliederung: rhfData.gliederung,
        });

        const response = await submitForm(formDataToSubmit as unknown as Record<string, unknown>);

        if (response) {
          const content =
            typeof response === 'string' ? response : (response as { content?: string }).content;
          const metadata =
            typeof response === 'object'
              ? (response as { metadata?: Record<string, unknown> }).metadata
              : undefined;

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
    },
    [
      submitForm,
      resetSuccess,
      setGeneratedText,
      setStoreIsLoading,
      componentName,
      selectedRequestType,
      builder,
    ]
  );

  const displayContent = useMemo(() => {
    const content = storeGeneratedText || antragContent;

    if (content) {
      return {
        content,
        title: null,
        metadata: {},
        useMarkdown: false,
      };
    }

    return null;
  }, [storeGeneratedText, antragContent]);

  const requestTypeOptions = useMemo(
    () =>
      Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
        icon: REQUEST_TYPE_ICONS[value],
      })),
    []
  );

  const handleRequestTypeChange = useCallback(
    (value: string | number | (string | number)[] | null | undefined) => {
      const val = Array.isArray(value) ? value[0] : value;
      setSelectedRequestType(
        String(val ?? REQUEST_TYPES.ANTRAG) as
          | typeof REQUEST_TYPES.ANTRAG
          | typeof REQUEST_TYPES.KLEINE_ANFRAGE
          | typeof REQUEST_TYPES.GROSSE_ANFRAGE
      );
    },
    []
  );

  const renderRequestTypeSection = useCallback(
    () => (
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
    ),
    [requestTypeOptions, selectedRequestType, handleRequestTypeChange]
  );

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
          tabIndex={
            (form.generator?.tabIndex as Record<string, unknown>)?.inhalt as number | undefined
          }
        />

        <SmartInput
          fieldType="gliederung"
          name="gliederung"
          control={control}
          setValue={setValue}
          getValues={getValues}
          label={FORM_LABELS.GLIEDERUNG}
          placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
          tabIndex={
            (form.generator?.tabIndex as Record<string, unknown>)?.gliederung as number | undefined
          }
          onSubmitSuccess={success ? String(getValues('gliederung') || '') : null}
          shouldSave={success}
          formName="antrag"
        />
      </>
    );
  };

  const renderFirstExtras = useCallback(
    () => <>{renderRequestTypeSection()}</>,
    [renderRequestTypeSection]
  );

  return (
    <BaseForm
      {...form.generator?.baseFormProps}
      componentName={componentName}
      onSubmit={() => {
        const submitHandler = handleSubmit(async (data: unknown) => {
          await onSubmitRHF(data as unknown as FormValues);
        });
        return submitHandler();
      }}
      loading={loading}
      success={success}
      error={error}
      generatedContent={displayContent?.content || ''}
      useMarkdown={displayContent?.useMarkdown ?? false}
      nextButtonText="Grünerieren"
      firstExtrasChildren={renderFirstExtras()}
      platformOptions={
        (form.generator?.baseFormProps?.platformOptions ?? undefined) as unknown as
          | any[]
          | undefined
      }
    >
      {renderFormInputs()}
    </BaseForm>
  );
});

AntragTab.displayName = 'AntragTab';

export default AntragTab;
