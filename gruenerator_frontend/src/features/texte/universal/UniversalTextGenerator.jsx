import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import BaseForm from '../../../components/common/BaseForm';
import ErrorBoundary from '../../../components/ErrorBoundary';
import PlatformSelector from '../../../components/common/PlatformSelector';
import Icon from '../../../components/common/Icon';
import RedeForm from './RedeForm';
import WahlprogrammForm from './WahlprogrammForm';
import BuergeranfragenForm from './BuergeranfragenForm';
import UniversalForm from './UniversalForm';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useBaseForm from '../../../components/common/Form/hooks/useBaseForm';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';

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
  [TEXT_TYPES.REDE]: 'Grünerator für Reden',
  [TEXT_TYPES.WAHLPROGRAMM]: 'Grünerator für Wahlprogramm-Kapitel',
  [TEXT_TYPES.BUERGERANFRAGEN]: 'Grünerator für Bürger*innenanfragen',
  [TEXT_TYPES.UNIVERSAL]: 'Universal Grünerator'
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
const getInitialTextType = (pathname) => {
  if (pathname === '/rede') return TEXT_TYPES.REDE;
  if (pathname === '/buergerinnenanfragen') return TEXT_TYPES.BUERGERANFRAGEN;
  if (pathname === '/wahlprogramm') return TEXT_TYPES.WAHLPROGRAMM;
  return TEXT_TYPES.UNIVERSAL;
};

const UniversalTextGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'universal-text';
  const location = useLocation();

  // Initialize with URL-based text type
  const [selectedType, setSelectedType] = useState(() => {
    const initialType = getInitialTextType(location.pathname);
    return initialType;
  });
  const [generatedContent, setGeneratedContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Create separate refs for each form type to avoid stale references
  const redeFormRef = useRef();
  const wahlprogrammFormRef = useRef();
  const buergeranfragenFormRef = useRef();
  const universalFormRef = useRef();

  // Get current form ref based on selected type
  const getCurrentFormRef = () => {
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
  const { getFeatureState } = useGeneratorKnowledgeStore();

  // Update selected type when URL changes
  useEffect(() => {
    const newType = getInitialTextType(location.pathname);
    if (newType !== selectedType) {
      setSelectedType(newType);
    }
  }, [location.pathname]); // Removed selectedType dependency to prevent loops

  // Reset form when type changes
  useEffect(() => {
    if (currentFormRef.current?.resetForm) {
      currentFormRef.current.resetForm();
    }
  }, [selectedType, currentFormRef]);

  // Map selected text type to instruction type
  const getInstructionType = (textType) => {
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

  // Memoize helpContent to prevent unnecessary re-renders
  const helpContent = useMemo(() => ({
    content: "Der Universal Text Grünerator erstellt verschiedene Textarten - von Reden über Wahlprogramme bis hin zu Bürger*innenanfragen und allgemeinen Texten.",
    title: TEXT_TYPE_TITLES[selectedType],
    tips: [
      "Wähle zunächst den passenden Texttyp aus",
      "Reden: Perfekt für Veranstaltungen und öffentliche Auftritte",
      "Wahlprogramme: Strukturierte politische Inhalte",
      "Bürger*innenanfragen: Professionelle Antworten auf Anfragen von Bürger*innen",
      "Universal: Für alle anderen Textarten geeignet",
      "Gib spezifische Details für bessere Ergebnisse an"
    ]
  }), [selectedType]);

  // Create baseForm - we'll use the knowledge and UI features but handle submission ourselves
  const form = useBaseForm({
    defaultValues: {},
    // Generator configuration - using a placeholder endpoint since we handle submission manually
    generatorType: 'universal-text',
    componentName: componentName,
    endpoint: '/placeholder', // This won't be used
    instructionType: currentInstructionType,
    features: ['webSearch', 'privacyMode', 'proMode'],
    tabIndexKey: 'UNIVERSAL',
    helpContent: helpContent
  });

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

    // Add feature toggles from store and attachments to form data
    const features = getFeatureState();
    Object.assign(formData, features); // Add useWebSearchTool, usePrivacyMode, useBedrock from store
    formData.attachments = form.generator.attachedFiles;

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

      if (content) {
        setGeneratedContent(content);
        form.generator.handleGeneratedContentChange(content);
        console.log('[UniversalTextGenerator] Content set successfully');
      }
    } catch (error) {
      console.error('[UniversalTextGenerator] Error submitting form:', error);
      form.handleSubmitError(error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, form, currentFormRef, getFeatureState]);

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedContent(content);
    form.generator.handleGeneratedContentChange(content);
  }, [form.generator]);

  const renderForm = () => {
    switch (selectedType) {
      case TEXT_TYPES.REDE:
        return <RedeForm key={`rede-${selectedType}`} ref={redeFormRef} tabIndex={form.generator.tabIndex} />;
      case TEXT_TYPES.WAHLPROGRAMM:
        return <WahlprogrammForm key={`wahlprogramm-${selectedType}`} ref={wahlprogrammFormRef} tabIndex={form.generator.tabIndex} />;
      case TEXT_TYPES.BUERGERANFRAGEN:
        return <BuergeranfragenForm key={`buergeranfragen-${selectedType}`} ref={buergeranfragenFormRef} tabIndex={form.generator.tabIndex} />;
      case TEXT_TYPES.UNIVERSAL:
        return <UniversalForm key={`universal-${selectedType}`} ref={universalFormRef} tabIndex={form.generator.tabIndex} />;
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
      control={null}
      enableIcons={true}
      enableSubtitles={false}
      isSearchable={false}
      required={true}
    />
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          key={selectedType}
          {...form.generator.baseFormProps}
          title={<span className="gradient-title">{TEXT_TYPE_TITLES[selectedType]}</span>}
          generatedContent={generatedContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSubmit={handleSubmit}
          loading={isLoading}
          firstExtrasChildren={renderTextTypeSection()}
        >
          {renderForm()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

UniversalTextGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default UniversalTextGenerator; 