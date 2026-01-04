import React, { useState, useCallback, useRef, useEffect, useMemo, RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import BaseForm from '../../../components/common/BaseForm';
import type { BaseFormProps } from '../../../types/baseform';
import ErrorBoundary from '../../../components/ErrorBoundary';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import RedeForm from './RedeForm';
import WahlprogrammForm from './WahlprogrammForm';
import BuergeranfragenForm from './BuergeranfragenForm';
import UniversalForm from './UniversalForm';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useGeneratorSelectionStore } from '../../../stores/core/generatorSelectionStore';
import { useUserInstructions } from '../../../hooks/useUserInstructions';

// Form ref interface for child forms
interface FormRef {
  getFormData: () => Record<string, unknown> | null;
  resetForm: (data?: Record<string, unknown>) => void;
}

interface UniversalTextGeneratorProps {
  showHeaderFooter?: boolean;
}

// Text type constants (moved from TextTypeSelector)
export const TEXT_TYPES = {
  REDE: 'rede',
  WAHLPROGRAMM: 'wahlprogramm',
  BUERGERANFRAGEN: 'buergeranfragen',
  UNIVERSAL: 'universal'
};

export const TEXT_TYPE_LABELS = {
  [TEXT_TYPES.REDE]: 'Rede',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Wahlprogramm',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Bürger*innenanfragen',
  [TEXT_TYPES.UNIVERSAL]: 'Universal'
};

export const TEXT_TYPE_TITLES = {
  [TEXT_TYPES.REDE]: 'Welche Rede willst du heute grünerieren?',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Welches Wahlprogramm-Kapitel willst du heute grünerieren?',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Welche Bürger*innenanfrage willst du heute grünerieren?',
  [TEXT_TYPES.UNIVERSAL]: 'Welchen Text willst du heute grünerieren?'
};

const TEXT_TYPE_ICONS = {
  [TEXT_TYPES.REDE]: () => <Icon category="textTypes" name="rede" size={16} />,
  [TEXT_TYPES.WAHLPROGRAMM]: () => <Icon category="textTypes" name="wahlprogramm" size={16} />,
  [TEXT_TYPES.BUERGERANFRAGEN]: () => <Icon category="textTypes" name="buergeranfragen" size={16} />,
  [TEXT_TYPES.UNIVERSAL]: () => <Icon category="textTypes" name="universal" size={16} />
};

const TEXT_TYPE_DESCRIPTIONS = {
  [TEXT_TYPES.REDE]: 'Perfekt für Veranstaltungen und öffentliche Auftritte',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Strukturierte politische Inhalte',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Professionelle Antworten auf Anfragen von Bürger*innen',
  [TEXT_TYPES.UNIVERSAL]: 'Für alle anderen Textarten geeignet'
};

const API_ENDPOINTS = {
  [TEXT_TYPES.REDE]: '/claude_rede',
  [TEXT_TYPES.WAHLPROGRAMM]: '/claude_wahlprogramm',
  [TEXT_TYPES.BUERGERANFRAGEN]: '/claude_buergeranfragen',
  [TEXT_TYPES.UNIVERSAL]: '/claude_universal'
};

// Move URL detection function outside component to avoid React hook dependency issues
const getInitialTextType = (pathname: string): string => {
  if (pathname === '/rede') return TEXT_TYPES.REDE;
  if (pathname === '/buergerinnenanfragen') return TEXT_TYPES.BUERGERANFRAGEN;
  if (pathname === '/wahlprogramm') return TEXT_TYPES.WAHLPROGRAMM;
  return TEXT_TYPES.UNIVERSAL;
};

const UniversalTextGenerator: React.FC<UniversalTextGeneratorProps> = ({ showHeaderFooter = true }) => {
  const componentName = 'universal-text';
  const location = useLocation();

  // Initialize with URL-based text type
  const [selectedType, setSelectedType] = useState(() => {
    const initialType = getInitialTextType(location.pathname);
    return initialType;
  });
  const [isLoading, setIsLoading] = useState(false);

  // Create separate refs for each form type to avoid stale references
  const redeFormRef = useRef<FormRef>(null);
  const wahlprogrammFormRef = useRef<FormRef>(null);
  const buergeranfragenFormRef = useRef<FormRef>(null);
  const universalFormRef = useRef<FormRef>(null);

  // Get current form ref based on selected type
  const getCurrentFormRef = (): RefObject<FormRef | null> | null => {
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return redeFormRef;
      case TEXT_TYPES.WAHLPROGRAMM:
        return wahlprogrammFormRef;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return buergeranfragenFormRef;
      case TEXT_TYPES.UNIVERSAL:
        return universalFormRef;
      default:
        return null;
    }
  };

  const currentFormRef = getCurrentFormRef();

  useOptimizedAuth();

  // Get feature state from store
  const { getFeatureState, isInstructionsActive } = useGeneratorSelectionStore();

  // Update selected type when URL changes
  useEffect(() => {
    const newType = getInitialTextType(location.pathname);
    if (newType !== selectedType) {
      setSelectedType(newType);
    }
  }, [location.pathname]); // Removed selectedType dependency to prevent loops

  // Reset form when type changes
  useEffect(() => {
    if (currentFormRef?.current?.resetForm) {
      currentFormRef.current.resetForm();
    }
  }, [selectedType, currentFormRef]);

  // Map selected text type to instruction type
  const getInstructionType = (textType: string) => {
    switch (textType) {
      case TEXT_TYPES.REDE:
        return 'rede';
      case TEXT_TYPES.BUERGERANFRAGEN:
        return 'buergeranfragen';
      case TEXT_TYPES.UNIVERSAL:
        return 'universal';
      case TEXT_TYPES.WAHLPROGRAMM:
        return 'universal'; // Wahlprogramm uses universal instructions
      default:
        return 'universal';
    }
  };

  const currentInstructionType = getInstructionType(selectedType);

  // Fetch user's custom instructions (simple API call, no orchestration)
  const customPrompt = useUserInstructions(currentInstructionType, isInstructionsActive);

  // Memoize helpContent to prevent unnecessary re-renders
  const helpContent = useMemo(() => {
    const title = TEXT_TYPE_TITLES[selectedType as keyof typeof TEXT_TYPE_TITLES];
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

  // Create baseForm with knowledge system enabled for document/text fetching
  const form = useBaseForm({
    defaultValues: {} as Record<string, unknown>,
    generatorType: 'universal-text' as string,
    componentName: componentName as string,
    endpoint: '/placeholder' as string,
    disableKnowledgeSystem: false,
    features: ['webSearch', 'privacyMode', 'proMode'] as string[],
    tabIndexKey: 'UNIVERSAL' as string,
    defaultMode: 'privacy' as string,
    helpContent: helpContent
  } as any);

  // Custom submission handler for dynamic form types
  const handleSubmit = useCallback(async () => {
    console.log('[UniversalTextGenerator] handleSubmit called', {
      selectedType,
      currentFormRef: currentFormRef,
      hasRef: !!currentFormRef,
      hasCurrent: !!currentFormRef?.current,
      hasGetFormData: !!currentFormRef?.current?.getFormData
    });

    if (!currentFormRef?.current?.getFormData) {
      console.error('[UniversalTextGenerator] Form ref not ready or getFormData not available');
      return;
    }

    const formData = currentFormRef.current.getFormData();
    console.log('[UniversalTextGenerator] Form data retrieved:', formData);

    if (!formData) {
      console.error('[UniversalTextGenerator] No form data returned');
      return;
    }

    // Add feature toggles from store, custom instructions, and attachments to form data
    const features = getFeatureState();
    Object.assign(formData, features);
    formData.customPrompt = customPrompt;
    if (form.generator) {
      formData.attachments = form.generator.attachedFiles;
    }

    setIsLoading(true);

    try {
      // Import apiClient dynamically since this is a special case
      const { default: apiClient } = await import('../../../components/utils/apiClient');

      console.log('[UniversalTextGenerator] Submitting to endpoint:', API_ENDPOINTS[selectedType]);
      console.log('[UniversalTextGenerator] Final form data:', formData);

      // Submit to the correct endpoint for the selected type
      const response = await apiClient.post(API_ENDPOINTS[selectedType], formData);
      const responseData = response.data || response;

      // Handle both old string format and new {content, metadata} format
      const content = typeof responseData === 'string' ? responseData : responseData.content;
      const metadata = typeof responseData === 'object' ? responseData.metadata : {};

      console.log('[UniversalTextGenerator] Response received:', { responseData, content, metadata });

      if (content && form.generator) {
        form.generator.handleGeneratedContentChange(content);
        console.log('[UniversalTextGenerator] Content set successfully');
      }
    } catch (error) {
      console.error('[UniversalTextGenerator] Error submitting form:', error);
      if (error instanceof Error) {
        form.handleSubmitError(error);
      } else {
        form.handleSubmitError(new Error(String(error)));
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, form, currentFormRef, getFeatureState, customPrompt]);

  const renderForm = () => {
    const tabIndexValue = form.generator?.tabIndex;
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return <RedeForm key={`rede-${selectedType}`} ref={redeFormRef as React.Ref<any>} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.WAHLPROGRAMM:
        return <WahlprogrammForm key={`wahlprogramm-${selectedType}`} ref={wahlprogrammFormRef as React.Ref<any>} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return <BuergeranfragenForm key={`buergeranfragen-${selectedType}`} ref={buergeranfragenFormRef as React.Ref<any>} tabIndex={tabIndexValue} />;
      case TEXT_TYPES.UNIVERSAL:
        return <UniversalForm key={`universal-${selectedType}`} ref={universalFormRef as React.Ref<any>} tabIndex={tabIndexValue} />;
      default:
        return null;
    }
  };

  const textTypeOptions = useMemo(() => Object.entries(TEXT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    icon: TEXT_TYPE_ICONS[value]
  })), []);

  const renderTextTypeSection = () => (
    <PlatformSelector
      name="textType"
      options={textTypeOptions}
      value={selectedType}
      onChange={setSelectedType}
      label="Art des Textes"
      placeholder="Textart auswählen..."
      isMulti={false}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        {form.generator && (
          <BaseForm
            key={selectedType}
            {...(form.generator.baseFormProps as unknown as BaseFormProps)}
            enableEditMode={true}
            title={<span className="gradient-title">{TEXT_TYPE_TITLES[selectedType as keyof typeof TEXT_TYPE_TITLES]}</span>}
            onSubmit={handleSubmit}
            loading={isLoading}
            firstExtrasChildren={renderTextTypeSection()}
          >
            {renderForm()}
          </BaseForm>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default UniversalTextGenerator;
