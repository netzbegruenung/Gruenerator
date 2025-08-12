import React, { useState, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useForm } from 'react-hook-form';
import BaseForm from '../../../components/common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import StyledCheckbox from '../../../components/common/AnimatedCheckbox';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { HiInformationCircle, HiGlobeAlt, HiShieldCheck } from 'react-icons/hi';
import { createKnowledgeFormNotice, createKnowledgePrompt } from '../../../utils/knowledgeFormUtils';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';
import { useTabIndex, useBaseFormTabIndex } from '../../../hooks/useTabIndex';
import AntragSavePopup from './components/AntragSavePopup';
import { saveAntrag } from './antragSaveUtils';
import FormSelect from '../../../components/common/Form/Input/FormSelect';
import BundestagDocumentSelector from '../../../components/common/BundestagDocumentSelector/BundestagDocumentSelector';
import { prepareFilesForSubmission } from '../../../utils/fileAttachmentUtils';

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

const REQUEST_TYPE_TITLES = {
  [REQUEST_TYPES.ANTRAG]: 'Grünerator für Anträge',
  [REQUEST_TYPES.KLEINE_ANFRAGE]: 'Grünerator für Kleine Anfragen',
  [REQUEST_TYPES.GROSSE_ANFRAGE]: 'Grünerator für Große Anfragen'
};

const AntragGenerator = ({ showHeaderFooter = true }) => {
  const componentName = 'antrag-generator';
  const { user, bundestagApiEnabled } = useOptimizedAuth();
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();

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
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      requestType: REQUEST_TYPES.ANTRAG,
      idee: '',
      details: '',
      gliederung: '',
      useWebSearchTool: false,
      usePrivacyMode: false
    }
  });

  const watchUseWebSearch = watch('useWebSearchTool');
  const watchUsePrivacyMode = watch('usePrivacyMode');
  const watchRequestType = watch('requestType');

  const [antragContent, setAntragContent] = useState('');
  const [isSavePopupOpen, setIsSavePopupOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBundestagDocuments, setSelectedBundestagDocuments] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [processedAttachments, setProcessedAttachments] = useState([]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/antraege/generate-simple');
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  
  // Store integration - all knowledge and instructions from store
  const {
    source,
    availableKnowledge,
    isInstructionsActive,
    instructions,
    getKnowledgeContent,
    getDocumentContent,
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
      const formDataToSubmit = {
        requestType: rhfData.requestType,
        idee: rhfData.idee,
        details: rhfData.details,
        gliederung: rhfData.gliederung,
        useWebSearchTool: rhfData.useWebSearchTool,
        usePrivacyMode: rhfData.usePrivacyMode,
        useBundestagApi: bundestagApiEnabled && selectedBundestagDocuments.length > 0,
        selectedBundestagDocuments: selectedBundestagDocuments,
        attachments: processedAttachments
      };
      
      // Extract search query from form data for intelligent document content
      const extractQueryFromFormData = (data) => {
        const queryParts = [];
        if (data.idee) queryParts.push(data.idee);
        if (data.details) queryParts.push(data.details);
        if (data.gliederung) queryParts.push(data.gliederung);
        return queryParts.filter(part => part && part.trim()).join(' ');
      };
      
      const searchQuery = extractQueryFromFormData(formDataToSubmit);
      console.log('[AntragGenerator] Extracted search query from form:', searchQuery);

      // Add knowledge, instructions, and documents
      const finalPrompt = await createKnowledgePrompt({
        source,
        isInstructionsActive,
        getActiveInstruction,
        instructionType: 'antrag',
        groupDetailsData,
        getKnowledgeContent,
        getDocumentContent,
        memoryOptions: {
          enableMemories: false, // Not using memories in this context
          query: searchQuery
        }
      });
      
      if (finalPrompt) {
        formDataToSubmit.customPrompt = finalPrompt; 
        console.log('[AntragGenerator] Final structured prompt added to formData.', finalPrompt.substring(0,100)+'...');
      } else {
        console.log('[AntragGenerator] No custom instructions or knowledge for generation.');
      }

      const response = await submitForm(formDataToSubmit);
      if (response) {
        // Handle both old string format and new {content, metadata} format
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
  }, [submitForm, resetSuccess, setGeneratedText, setStoreIsLoading, componentName, source, isInstructionsActive, getActiveInstruction, groupDetailsData, getKnowledgeContent, getDocumentContent, bundestagApiEnabled, selectedBundestagDocuments, processedAttachments]);

  const handleGeneratedContentChange = useCallback((content) => {
    setAntragContent(content);
    setGeneratedText(componentName, content);
  }, [setGeneratedText, componentName]);

  const handleSaveToDb = useCallback(async () => {
    setIsSavePopupOpen(true);
  }, []);

  const handleConfirmSave = useCallback(async (popupData) => {
    setIsSavePopupOpen(false);
    setIsSaving(true);
    
    try {
      const requestTypeLabel = REQUEST_TYPE_LABELS[getValues('requestType')] || 'Antrag';
      const payload = {
        title: popupData.title || `${requestTypeLabel}: ${getValues('idee')}` || `Unbenannte ${requestTypeLabel}`,
        antragstext: storeGeneratedText || antragContent,
        gliederung: getValues('gliederung') || '',
        ...popupData,
      };
      await saveAntrag(payload);
    } catch (saveError) {
      console.error('[AntragGenerator] Error during final save of antrag:', saveError);
    } finally {
      setIsSaving(false);
    }
  }, [watch, storeGeneratedText, antragContent]);

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
    content: `Dieser Grünerator erstellt strukturierte Anträge und Anfragen für politische Gremien basierend auf deiner Idee und den Details.${bundestagApiEnabled ? ' Du kannst relevante parlamentarische Dokumente aus dem Bundestag zur Fundierung auswählen.' : ''} Du kannst auch PDFs und Bilder als Hintergrundinformation anhängen.`,
    tips: [
      "Wähle die Art: Antrag, Kleine oder Große Anfrage",
      "Kleine Anfragen: Präzise Fachinformationen punktuell abfragen",
      "Große Anfragen: Umfassende politische Themen mit Debatte",
      "Formuliere deine Idee klar und präzise",
      "Hänge PDFs oder Bilder als Kontext an (max. 5MB pro Datei)",
      "Nutze die Websuche für aktuelle Informationen",
      ...(bundestagApiEnabled ? ["Suche und wähle parlamentarische Dokumente zur Fundierung deines Antrags"] : []),
      "Speichere wichtige Dokumente in der Datenbank"
    ]
  };

  const requestTypeOptions = Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({
    value,
    label
  }));

  const renderFormInputs = () => (
    <>
      <FormSelect
        name="requestType"
        control={control}
        label="Art der Anfrage"
        options={requestTypeOptions}
        tabIndex={tabIndex.requestType || 1}
      />

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

      <Input
        name="gliederung"
        control={control}
        label={FORM_LABELS.GLIEDERUNG}
        placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
        tabIndex={tabIndex.gliederung}
      />
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

  // const bundestagDocumentSelector = bundestagApiEnabled ? (
  //   <BundestagDocumentSelector
  //     onDocumentSelection={setSelectedBundestagDocuments}
  //     disabled={loading}
  //     tabIndex={tabIndex.bundestagDocuments}
  //     searchQuery={`${getValues('idee')} ${getValues('details')}`.trim()}
  //   />
  // ) : null;

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title={REQUEST_TYPE_TITLES[watchRequestType] || REQUEST_TYPE_TITLES[REQUEST_TYPES.ANTRAG]}
          onSubmit={handleSubmit(onSubmitRHF)}
          loading={loading}
          success={success}
          error={error}
          generatedContent={storeGeneratedText || antragContent}
          onGeneratedContentChange={handleGeneratedContentChange}
          onSave={handleSaveToDb}
          saveLoading={isSaving}
          formNotice={formNotice}
          enableKnowledgeSelector={true}
          enableDocumentSelector={true}
          helpContent={helpContent}
          webSearchFeatureToggle={webSearchFeatureToggle}
          useWebSearchFeatureToggle={true}
          privacyModeToggle={privacyModeToggle}
          usePrivacyModeToggle={true}
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
          // firstExtrasChildren={bundestagDocumentSelector}
        >
          {renderFormInputs()}
        </BaseForm>
        
        <AntragSavePopup
          isOpen={isSavePopupOpen}
          onClose={() => setIsSavePopupOpen(false)}
          onConfirm={handleConfirmSave}
          isSaving={isSaving}
          antragstext={storeGeneratedText || antragContent}
          initialData={{ title: `${REQUEST_TYPE_LABELS[getValues('requestType')] || 'Antrag'}: ${getValues('idee')}` }}
        />
      </div>
    </ErrorBoundary>
  );
};

AntragGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default AntragGenerator;