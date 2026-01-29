import React, {
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type RefObject,
  memo,
  useState,
  type ChangeEvent,
} from 'react';

import BaseForm from '../../../components/common/BaseForm';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import TextInput from '../../../components/common/Form/Input/TextInput';
import { FORM_LABELS } from '../../../components/utils/constants';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import LeichteSpracheForm from '../accessibility/components/LeichteSpracheForm';
import { type UniversalSubType } from '../types';
import BuergeranfragenForm from '../universal/BuergeranfragenForm';
import RedeForm from '../universal/RedeForm';
import WahlprogrammForm from '../universal/WahlprogrammForm';

interface FormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

interface UniversalTabProps {
  isActive: boolean;
  selectedType: UniversalSubType;
}

const TEXT_TYPES = {
  REDE: 'rede',
  WAHLPROGRAMM: 'wahlprogramm',
  BUERGERANFRAGEN: 'buergeranfragen',
  LEICHTE_SPRACHE: 'leichte_sprache',
} as const;

const TEXT_TYPE_TITLES: Record<UniversalSubType, string> = {
  [TEXT_TYPES.REDE]: 'Welche Rede willst du heute grünerieren?',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Welches Wahlprogramm-Kapitel willst du heute grünerieren?',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Welche Bürger*innenanfrage willst du heute grünerieren?',
  [TEXT_TYPES.LEICHTE_SPRACHE]: 'Welchen Text willst du in Leichte Sprache übersetzen?',
};

const API_ENDPOINTS: Record<UniversalSubType, string> = {
  [TEXT_TYPES.REDE]: '/claude_rede',
  [TEXT_TYPES.WAHLPROGRAMM]: '/claude_wahlprogramm',
  [TEXT_TYPES.BUERGERANFRAGEN]: '/claude_buergeranfragen',
  [TEXT_TYPES.LEICHTE_SPRACHE]: '/leichte_sprache',
};

interface ExtrasInputConfig {
  id: string;
  label: string;
  placeholder: string;
  helpText: string;
  min: number;
  max: number;
}

const EXTRAS_CONFIG: Partial<Record<UniversalSubType, ExtrasInputConfig>> = {
  [TEXT_TYPES.REDE]: {
    id: 'redezeit',
    label: 'Redezeit (Minuten)',
    placeholder: '1-5',
    helpText: 'Maximal 5 Minuten möglich',
    min: 1,
    max: 5,
  },
  [TEXT_TYPES.WAHLPROGRAMM]: {
    id: 'zeichenanzahl',
    label: FORM_LABELS.CHARACTER_COUNT,
    placeholder: '1000-3500',
    helpText: 'Zwischen 1.000 und 3.500 Zeichen möglich',
    min: 1000,
    max: 3500,
  },
};

const UniversalTab: React.FC<UniversalTabProps> = memo(({ isActive, selectedType }) => {
  const componentName = 'universal-text';

  const redeFormRef = useRef<FormRef>(null);
  const wahlprogrammFormRef = useRef<FormRef>(null);
  const buergeranfragenFormRef = useRef<FormRef>(null);
  const leichteSpracheFormRef = useRef<FormRef>(null);

  const [extrasValue, setExtrasValue] = useState<string>('');

  const getCurrentFormRef = (): RefObject<FormRef | null> | null => {
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return redeFormRef;
      case TEXT_TYPES.WAHLPROGRAMM:
        return wahlprogrammFormRef;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return buergeranfragenFormRef;
      case TEXT_TYPES.LEICHTE_SPRACHE:
        return leichteSpracheFormRef;
      default:
        return null;
    }
  };

  const currentFormRef = getCurrentFormRef();

  useOptimizedAuth();

  const getInstructionType = (textType: UniversalSubType) => {
    switch (textType) {
      case TEXT_TYPES.REDE:
        return 'rede' as const;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return 'buergeranfragen' as const;
      case TEXT_TYPES.LEICHTE_SPRACHE:
        return 'leichte_sprache' as const;
      case TEXT_TYPES.WAHLPROGRAMM:
        return 'universal' as const;
      default:
        return 'universal' as const;
    }
  };

  const currentInstructionType = getInstructionType(selectedType);

  const setup = useGeneratorSetup({
    instructionType: currentInstructionType,
    componentName: 'universal-text',
  });

  useEffect(() => {
    if (currentFormRef?.current?.resetForm) {
      currentFormRef.current.resetForm();
    }
    setExtrasValue('');
  }, [selectedType, currentFormRef]);

  const handleExtrasValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setExtrasValue(e.target.value);
  }, []);

  const helpContent = useMemo(() => {
    const title = TEXT_TYPE_TITLES[selectedType];
    return {
      content:
        'Der Universal Text Grünerator erstellt verschiedene Textarten - von Reden über Wahlprogramme bis hin zu Bürger*innenanfragen.',
      title: title || 'Universal Text Grünerator',
      tips: [
        'Reden: Perfekt für Veranstaltungen und öffentliche Auftritte',
        'Wahlprogramme: Strukturierte politische Inhalte',
        'Bürger*innenanfragen: Professionelle Antworten auf Anfragen von Bürger*innen',
        'Leichte Sprache: Texte in einfacher, verständlicher Sprache',
        'Gib spezifische Details für bessere Ergebnisse an',
      ],
    };
  }, [selectedType]);

  const form = useBaseForm({
    defaultValues: {} as Record<string, unknown>,
    generatorType: 'universal-text',
    componentName: componentName,
    endpoint: '/placeholder',
    disableKnowledgeSystem: false,
    features: ['webSearch', 'privacyMode', 'proMode'],
    tabIndexKey: 'UNIVERSAL',
    defaultMode: 'privacy',
    helpContent: helpContent,
  } as unknown as Parameters<typeof useBaseForm>[0]);

  const allAttachments = useMemo(
    () => form.generator?.attachedFiles || [],
    [form.generator?.attachedFiles]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: [] as const,
  });

  const handleSubmit = useCallback(async () => {
    if (!currentFormRef?.current?.getFormData) {
      console.error('[UniversalTab] Form ref not ready or getFormData not available');
      return;
    }

    const formData = currentFormRef.current.getFormData();

    if (!formData) {
      console.error('[UniversalTab] No form data returned');
      return;
    }

    const extrasConfig = EXTRAS_CONFIG[selectedType];
    const dataWithExtras = extrasConfig
      ? { ...formData, [extrasConfig.id]: extrasValue }
      : formData;

    const formDataToSubmit = builder.buildSubmissionData(dataWithExtras);

    try {
      const { default: apiClient } = await import('../../../components/utils/apiClient');

      const endpoint = API_ENDPOINTS[selectedType];
      const response = await apiClient.post(endpoint, formDataToSubmit);
      const responseData = response.data || response;

      const content = typeof responseData === 'string' ? responseData : responseData.content;

      if (content && form.generator) {
        form.generator.handleGeneratedContentChange(content);
      }
    } catch (error) {
      console.error('[UniversalTab] Error submitting form:', error);
      if (error instanceof Error) {
        form.handleSubmitError(error);
      } else {
        form.handleSubmitError(new Error(String(error)));
      }
    }
  }, [selectedType, form, currentFormRef, builder, extrasValue]);

  const renderForm = () => {
    const rawTabIndex = form.generator?.tabIndex;
    const tabIndexValue = (rawTabIndex || {}) as
      | { formType?: number; hauptfeld?: number; [key: string]: number | undefined }
      | undefined;
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return <RedeForm key={`rede-${selectedType}`} ref={redeFormRef} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.WAHLPROGRAMM:
        return (
          <WahlprogrammForm
            key={`wahlprogramm-${selectedType}`}
            ref={wahlprogrammFormRef}
            tabIndex={tabIndexValue}
          />
        );
      case TEXT_TYPES.BUERGERANFRAGEN:
        return (
          <BuergeranfragenForm
            key={`buergeranfragen-${selectedType}`}
            ref={buergeranfragenFormRef}
            tabIndex={tabIndexValue}
          />
        );
      case TEXT_TYPES.LEICHTE_SPRACHE:
        return (
          <LeichteSpracheForm
            key={`leichte-sprache-${selectedType}`}
            ref={leichteSpracheFormRef as React.Ref<any>}
            tabIndex={tabIndexValue}
          />
        );
      default:
        return null;
    }
  };

  const baseFormProps = form.generator?.baseFormProps;
  const {
    platformOptions: _platformOptions,
    componentName: _componentName,
    ...restBaseFormProps
  } = baseFormProps || {};

  const renderExtrasInput = useCallback(() => {
    const config = EXTRAS_CONFIG[selectedType];
    if (!config) return null;

    return (
      <TextInput
        id={config.id}
        type="number"
        label={config.label}
        value={extrasValue}
        onChange={handleExtrasValueChange}
        placeholder={config.placeholder}
        helpText={config.helpText}
        inputProps={{
          min: config.min,
          max: config.max,
        }}
      />
    );
  }, [selectedType, extrasValue, handleExtrasValueChange]);

  return (
    <>
      {form.generator && (
        <BaseForm
          key={selectedType}
          {...restBaseFormProps}
          componentName={componentName}
          enableEditMode={true}
          onSubmit={handleSubmit}
          firstExtrasChildren={renderExtrasInput()}
        >
          {renderForm()}
        </BaseForm>
      )}
    </>
  );
});

UniversalTab.displayName = 'UniversalTab';

export default UniversalTab;
