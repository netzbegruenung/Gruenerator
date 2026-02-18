import React, { useState, useCallback, useMemo, memo } from 'react';

import BaseForm from '../../../components/common/BaseForm';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { FormTextarea } from '../../../components/common/Form/Input';
import SmartInput from '../../../components/common/Form/SmartInput';
import Icon from '../../../components/common/Icon';
import PlatformSelector from '../../../components/common/PlatformSelector';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useUserDefaults } from '../../../hooks/useUserDefaults';

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

  const setup = useGeneratorSetup({
    instructionType: 'antrag',
    componentName: 'antrag-generator',
  });

  const form = useBaseForm({
    defaultValues: {
      inhalt: '',
      gliederung: '',
    },
    generatorType: 'antrag',
    componentName: componentName,
    endpoint: '/antraege/generate-simple',
    instructionType: 'antrag',
    features: ['webSearch', 'privacyMode'],
    tabIndexKey: 'ANTRAG',
    defaultMode: 'pro',
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
    },
  } as unknown as Parameters<typeof useBaseForm>[0]);

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
      try {
        const formDataToSubmit = builder.buildSubmissionData({
          requestType: selectedRequestType,
          inhalt: rhfData.inhalt,
          gliederung: rhfData.gliederung,
        });

        const response = await form.generator!.submitForm(
          formDataToSubmit as unknown as Record<string, unknown>
        );

        if (response) {
          const content =
            typeof response === 'string' ? response : (response as { content?: string }).content;

          if (content && form.generator) {
            form.generator.handleGeneratedContentChange(content);
          }
        }
      } catch (submitError) {
        console.error('[AntragTab] Error submitting form:', submitError);
        if (submitError instanceof Error) {
          form.handleSubmitError(submitError);
        } else {
          form.handleSubmitError(new Error(String(submitError)));
        }
      }
    },
    [form, selectedRequestType, builder]
  );

  const success = form.generator?.success ?? false;

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
      useMarkdown={false}
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
