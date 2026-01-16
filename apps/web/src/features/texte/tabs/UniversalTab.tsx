import React, { useState, useCallback, useRef, useEffect, useMemo, RefObject, memo } from 'react';
import { useLocation } from 'react-router-dom';
import BaseForm from '../../../components/common/BaseForm';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import RedeForm from '../universal/RedeForm';
import WahlprogrammForm from '../universal/WahlprogrammForm';
import BuergeranfragenForm from '../universal/BuergeranfragenForm';
import UniversalForm from '../universal/UniversalForm';
import LeichteSpracheForm from '../accessibility/components/LeichteSpracheForm';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useGeneratorSetup } from '../../../hooks/useGeneratorSetup';
import { useFormDataBuilder } from '../../../hooks/useFormDataBuilder';

interface FormRef {
  getFormData: () => Record<string, unknown>;
  resetForm: (data?: Record<string, unknown>) => void;
}

interface UniversalTabProps {
  isActive: boolean;
}

export const TEXT_TYPES = {
  REDE: 'rede',
  WAHLPROGRAMM: 'wahlprogramm',
  BUERGERANFRAGEN: 'buergeranfragen',
  LEICHTE_SPRACHE: 'leichte_sprache',
  UNIVERSAL: 'universal'
} as const;

export const TEXT_TYPE_LABELS = {
  [TEXT_TYPES.REDE]: 'Rede',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Wahlprogramm',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Bürger*innenanfragen',
  [TEXT_TYPES.LEICHTE_SPRACHE]: 'Leichte Sprache',
  [TEXT_TYPES.UNIVERSAL]: 'Universal'
};

export const TEXT_TYPE_TITLES = {
  [TEXT_TYPES.REDE]: 'Welche Rede willst du heute grünerieren?',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Welches Wahlprogramm-Kapitel willst du heute grünerieren?',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Welche Bürger*innenanfrage willst du heute grünerieren?',
  [TEXT_TYPES.LEICHTE_SPRACHE]: 'Welchen Text willst du in Leichte Sprache übersetzen?',
  [TEXT_TYPES.UNIVERSAL]: 'Welchen Text willst du heute grünerieren?'
};

const RedeIcon = memo(() => <Icon category="textTypes" name="rede" size={16} />);
RedeIcon.displayName = 'RedeIcon';

const WahlprogrammIcon = memo(() => <Icon category="textTypes" name="wahlprogramm" size={16} />);
WahlprogrammIcon.displayName = 'WahlprogrammIcon';

const BuergeranfragenIcon = memo(() => <Icon category="textTypes" name="buergeranfragen" size={16} />);
BuergeranfragenIcon.displayName = 'BuergeranfragenIcon';

const LeichteSpracheIcon = memo(() => <Icon category="accessibility" name="leichteSprache" size={16} />);
LeichteSpracheIcon.displayName = 'LeichteSpracheIcon';

const UniversalIcon = memo(() => <Icon category="textTypes" name="universal" size={16} />);
UniversalIcon.displayName = 'UniversalIcon';

const TEXT_TYPE_ICONS: Record<string, () => React.ReactNode> = {
  [TEXT_TYPES.REDE]: () => <RedeIcon />,
  [TEXT_TYPES.WAHLPROGRAMM]: () => <WahlprogrammIcon />,
  [TEXT_TYPES.BUERGERANFRAGEN]: () => <BuergeranfragenIcon />,
  [TEXT_TYPES.LEICHTE_SPRACHE]: () => <LeichteSpracheIcon />,
  [TEXT_TYPES.UNIVERSAL]: () => <UniversalIcon />
};

const API_ENDPOINTS = {
  [TEXT_TYPES.REDE]: '/claude_rede',
  [TEXT_TYPES.WAHLPROGRAMM]: '/claude_wahlprogramm',
  [TEXT_TYPES.BUERGERANFRAGEN]: '/claude_buergeranfragen',
  [TEXT_TYPES.LEICHTE_SPRACHE]: '/claude_leichte_sprache',
  [TEXT_TYPES.UNIVERSAL]: '/claude_universal'
};

const getInitialTextType = (pathname: string): string => {
  if (pathname === '/rede') return TEXT_TYPES.REDE;
  if (pathname === '/buergerinnenanfragen') return TEXT_TYPES.BUERGERANFRAGEN;
  if (pathname === '/wahlprogramm') return TEXT_TYPES.WAHLPROGRAMM;
  return TEXT_TYPES.UNIVERSAL;
};

const UniversalTab: React.FC<UniversalTabProps> = memo(({ isActive }) => {
  const componentName = 'universal-text';
  const location = useLocation();

  const [selectedType, setSelectedType] = useState(() => {
    const initialType = getInitialTextType(location.pathname);
    return initialType;
  });
  const [isLoading, setIsLoading] = useState(false);

  const redeFormRef = useRef<FormRef>(null);
  const wahlprogrammFormRef = useRef<FormRef>(null);
  const buergeranfragenFormRef = useRef<FormRef>(null);
  const leichteSpracheFormRef = useRef<FormRef>(null);
  const universalFormRef = useRef<FormRef>(null);

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
      case TEXT_TYPES.UNIVERSAL:
        return universalFormRef;
      default:
        return null;
    }
  };

  const currentFormRef = getCurrentFormRef();

  useOptimizedAuth();

  const getInstructionType = (textType: string) => {
    switch (textType) {
      case TEXT_TYPES.REDE:
        return 'rede' as const;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return 'buergeranfragen' as const;
      case TEXT_TYPES.LEICHTE_SPRACHE:
        return 'leichte_sprache' as const;
      case TEXT_TYPES.UNIVERSAL:
        return 'universal' as const;
      case TEXT_TYPES.WAHLPROGRAMM:
        return 'universal' as const;
      default:
        return 'universal' as const;
    }
  };

  const currentInstructionType = getInstructionType(selectedType);

  const setup = useGeneratorSetup({
    instructionType: currentInstructionType,
    componentName: 'universal-text'
  });

  useEffect(() => {
    const newType = getInitialTextType(location.pathname);
    if (newType !== selectedType) {
      setSelectedType(newType);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (currentFormRef?.current?.resetForm) {
      currentFormRef.current.resetForm();
    }
  }, [selectedType, currentFormRef]);

  const helpContent = useMemo(() => {
    const title = TEXT_TYPE_TITLES[selectedType as keyof typeof TEXT_TYPE_TITLES] || TEXT_TYPE_TITLES[TEXT_TYPES.UNIVERSAL];
    return {
      content: "Der Universal Text Grünerator erstellt verschiedene Textarten - von Reden über Wahlprogramme bis hin zu Bürger*innenanfragen und allgemeinen Texten.",
      title: title || 'Universal Text Grünerator',
      tips: [
        "Wähle zunächst den passenden Texttyp aus",
        "Reden: Perfekt für Veranstaltungen und öffentliche Auftritte",
        "Wahlprogramme: Strukturierte politische Inhalte",
        "Bürger*innenanfragen: Professionelle Antworten auf Anfragen von Bürger*innen",
        "Universal: Für alle anderen Textarten geeignet",
        "Gib spezifische Details für bessere Ergebnisse an"
      ]
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
    helpContent: helpContent
  } as unknown as Parameters<typeof useBaseForm>[0]);

  const allAttachments = useMemo(() =>
    form.generator?.attachedFiles || [],
    [form.generator?.attachedFiles]
  );

  const builder = useFormDataBuilder({
    ...setup,
    attachments: allAttachments,
    searchQueryFields: [] as const
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

    const formDataToSubmit = builder.buildSubmissionData(formData);

    setIsLoading(true);

    try {
      const { default: apiClient } = await import('../../../components/utils/apiClient');

      const endpoint = API_ENDPOINTS[selectedType as keyof typeof API_ENDPOINTS] || API_ENDPOINTS[TEXT_TYPES.UNIVERSAL];
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
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, form, currentFormRef, builder]);

  const renderForm = () => {
    const rawTabIndex = form.generator?.tabIndex;
    const tabIndexValue = (rawTabIndex || {}) as { formType?: number; hauptfeld?: number; [key: string]: number | undefined } | undefined;
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return <RedeForm key={`rede-${selectedType}`} ref={redeFormRef} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.WAHLPROGRAMM:
        return <WahlprogrammForm key={`wahlprogramm-${selectedType}`} ref={wahlprogrammFormRef} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return <BuergeranfragenForm key={`buergeranfragen-${selectedType}`} ref={buergeranfragenFormRef} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.LEICHTE_SPRACHE:
        return <LeichteSpracheForm key={`leichte-sprache-${selectedType}`} ref={leichteSpracheFormRef as React.Ref<any>} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.UNIVERSAL:
        return <UniversalForm key={`universal-${selectedType}`} ref={universalFormRef} tabIndex={tabIndexValue} />;
      default:
        return null;
    }
  };

  const textTypeOptions = useMemo(() => Object.entries(TEXT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    icon: TEXT_TYPE_ICONS[value]
  })), []);

  const handleTypeChange = useCallback((value: string | number | (string | number)[] | null) => {
    if (typeof value === 'string') {
      setSelectedType(value);
    }
  }, []);

  const renderTextTypeSection = useCallback(() => (
    <PlatformSelector
      name="textType"
      options={textTypeOptions}
      value={selectedType}
      onChange={handleTypeChange}
      label="Art des Textes"
      placeholder="Textart auswählen..."
      isMulti={false}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  ), [textTypeOptions, selectedType, handleTypeChange]);

  const baseFormProps = form.generator?.baseFormProps;
  const { platformOptions: _platformOptions, componentName: _componentName, ...restBaseFormProps } = baseFormProps || {};

  if (!isActive) return null;

  return (
    <>
      {form.generator && (
        <BaseForm
          key={selectedType}
          {...restBaseFormProps}
          componentName={componentName}
          enableEditMode={true}
          onSubmit={handleSubmit}
          loading={isLoading}
          firstExtrasChildren={renderTextTypeSection()}
        >
          {renderForm()}
        </BaseForm>
      )}
    </>
  );
});

UniversalTab.displayName = 'UniversalTab';

export default UniversalTab;
