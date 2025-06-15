import React, { useCallback, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAntrag } from './useAntrag';
import { useAntragContext } from './AntragContext';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import BaseForm from '../../../components/common/BaseForm';
import { HiGlobeAlt, HiSave, HiInformationCircle } from 'react-icons/hi';
import SubmitButton from '../../../components/common/SubmitButton';
import AntragSavePopup from './components/AntragSavePopup';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { createStructuredFinalPrompt } from '../../../utils/promptUtils';
import useGroupDetails from '../../groups/hooks/useGroupDetails';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';
import useKnowledge from '../../../components/hooks/useKnowledge';

export const AntragForm = () => {
  const { user, betaFeatures } = useOptimizedAuth();
  const deutschlandmodus = betaFeatures?.deutschlandmodus;
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText: setStoreGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  
  // Initialize knowledge system
  useKnowledge();
  
  const {
    formData,
    handleInputChange,
    generateAntrag,
    loading,
    isSaving,
    saveStatus,
    saveGeneratedAntrag,
    resetSaveStatus
  } = useAntrag();
  
  const { 
    generatedAntrag, 
    setGeneratedAntrag,
    useWebSearch, 
    setUseWebSearch,
    displayedSources
  } = useAntragContext();

  // Store integration - all knowledge and instructions from store
  const {
    source,
    availableKnowledge,
    selectedKnowledgeIds,
    instructions,
    isInstructionsActive,
    getKnowledgeContent,
    getActiveInstruction
  } = useGeneratorKnowledgeStore();

  const [isSavePopupOpen, setIsSavePopupOpen] = useState(false);
  const [userCustomAntragPrompt, setUserCustomAntragPrompt] = useState(null);
  const [isUserCustomAntragPromptActive, setIsUserCustomAntragPromptActive] = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      idee: '',
      details: '',
      gliederung: ''
    }
  });

  useEffect(() => {
    reset({
      idee: formData.idee || '',
      details: formData.details || '',
      gliederung: formData.gliederung || ''
    });
  }, [formData, reset]);

  useEffect(() => {
    if (generatedAntrag) {
      setStoreGeneratedText(generatedAntrag);
    }
  }, [generatedAntrag, setStoreGeneratedText]);

  useEffect(() => {
    setStoreIsLoading(loading);
  }, [loading, setStoreIsLoading]);

  const { data: groupDetailsData, isLoading: isLoadingGroupDetails } = useGroupDetails(
    source.type === 'group' ? source.id : null,
    { isActive: source.type === 'group' }
  );

  const onSubmitRHF = async (rhfData) => {
    try {
      // Get active instruction based on source
      let activeInstruction = null;
      if (source.type === 'user' && isInstructionsActive) {
        activeInstruction = getActiveInstruction('antrag');
      } else if (source.type === 'group' && groupDetailsData?.instructions) {
        activeInstruction = groupDetailsData.instructions.custom_antrag_prompt;
      }
      
      // Get knowledge content from store
      const knowledgeContent = getKnowledgeContent();
      
      const finalPrompt = createStructuredFinalPrompt(
        activeInstruction,
        knowledgeContent
      );
      
      if (finalPrompt) {
        console.log('[AntragForm] Final structured prompt for generateAntrag:', finalPrompt.substring(0, 100) + '...');
      } else {
        console.log('[AntragForm] No custom instructions or knowledge for generateAntrag.');
      }

      if (handleInputChange) {
          handleInputChange('idee', rhfData.idee);
          handleInputChange('details', rhfData.details);
          handleInputChange('gliederung', rhfData.gliederung);
      }
      // Pass current form data to ensure we have the latest values
      await generateAntrag(finalPrompt, rhfData);
    } catch (submitError) {
      console.error('[AntragForm] Error submitting antrag:', submitError);
    }
  };

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedAntrag(content);
    setStoreGeneratedText(content);
  }, [setGeneratedAntrag, setStoreGeneratedText]);

  const getButtonText = () => {
    if (loading) {
      return "Antrag wird generiert...";
    }
    return "Antrag grünerieren";
  };

  const handleSaveToDb = async () => {
    setIsSavePopupOpen(true);
  };

  const handleConfirmSave = async (popupData) => {
    setIsSavePopupOpen(false);
    try {
      const { generatedText: storeGeneratedText } = useGeneratedTextStore.getState();
      const payload = {
        title: formData.idee || 'Unbenannter Antrag',
        antragstext: storeGeneratedText,
        gliederung: formData.gliederung || '',
        ...popupData,
      };
      await saveGeneratedAntrag(payload);
    } catch (saveError) {
      console.error('[AntragForm] Error during final save of antrag:', saveError);
    }
  };

  const formNoticeElement = (() => {
    if (source.type === 'group' && isLoadingGroupDetails) {
      return (
        <div className="custom-prompt-notice">
          <HiInformationCircle className="info-icon" />
          <span>Lade Gruppenanweisungen & Wissen...</span>
        </div>
      );
    }

    let noticeParts = [];
    let sourceNameForNotice = "";

    if (source.type === 'user') {
      sourceNameForNotice = "Persönliche";
      if (isInstructionsActive && instructions.antrag) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen`);
      } else if (instructions.antrag) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
      }
    } else if (source.type === 'group') {
      sourceNameForNotice = source.name || 'Gruppe';
      if (groupDetailsData?.instructions?.custom_antrag_prompt) {
        noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}"`);
      }
    }

    const hasLoadedKnowledge = availableKnowledge.length > 0;

    if (source.type !== 'neutral' && hasLoadedKnowledge) {
      if (source.type === 'user') {
        noticeParts.push('gesamtes persönliches Wissen');
      } else if (source.type === 'group') {
        noticeParts.push(`gesamtes Wissen der Gruppe "${sourceNameForNotice}"`);
      }
    }

    if (deutschlandmodus === true) {
      noticeParts.push("Deutschlandmodus aktiv");
    }

    if (noticeParts.length === 0 && source.type === 'neutral') {
      return (
        <div className="custom-prompt-notice neutral-notice">
          <HiInformationCircle className="info-icon" />
          <span>Standardmodus aktiv. Keine spezifischen Anweisungen, Wissen oder Deutschlandmodus ausgewählt.</span>
        </div>
      );
    }
    
    if (noticeParts.length === 0) return null;

    const fullNoticeText = noticeParts.join('. ');

    return (
      <div className="custom-prompt-notice">
        <HiInformationCircle className="info-icon" />
        <span>{fullNoticeText}.</span>
      </div>
    );
  })();

  const helpContent = {
    content: "Dieser Grünerator erstellt strukturierte Anträge für politische Gremien basierend auf deiner Idee und den Details.",
    tips: [
      "Formuliere deine Idee klar und präzise",
      "Füge ausführliche Begründungen hinzu",
      "Optional: Gib eine gewünschte Gliederung vor",
      "Nutze die Websuche für aktuelle Informationen",
      "Speichere wichtige Anträge in der Datenbank"
    ]
  };

  return (
    <div className="container with-header">
      <BaseForm
        title="Grünerator für Anträge"
        onSubmit={handleSubmit(onSubmitRHF)}
        loading={loading}
        generatedContent={generatedAntrag}
        onGeneratedContentChange={handleGeneratedContentChange}
        allowEditing={true}
        submitButtonProps={{
          showStatus: true,
          defaultText: getButtonText(),
          loading: loading
        }}
        disableAutoCollapse={true}
        webSearchFeatureToggle={{
          isActive: useWebSearch,
          onToggle: setUseWebSearch,
          label: "Websuche verwenden",
          icon: HiGlobeAlt,
          description: "Nutzt aktuelle Informationen aus dem Web."
        }}
        useWebSearchFeatureToggle={true}
        onSave={handleSaveToDb}
        saveLoading={isSaving}
        formNotice={formNoticeElement}
        enableKnowledgeSelector={true}
        helpContent={helpContent}
      >
        <Input
          name="idee"
          control={control}
          label={FORM_LABELS.IDEE}
          placeholder={FORM_PLACEHOLDERS.IDEE}
          required
          rules={{ required: 'Idee ist ein Pflichtfeld' }}
        />

        <Textarea
          name="details"
          control={control}
          label={FORM_LABELS.DETAILS}
          placeholder={FORM_PLACEHOLDERS.DETAILS}
          minRows={4}
          maxRows={12}
          rules={{ maxLength: { value: 5000, message: "Details dürfen maximal 5000 Zeichen lang sein" } }}
        />

        <Input
          name="gliederung"
          control={control}
          label={FORM_LABELS.GLIEDERUNG}
          placeholder={FORM_PLACEHOLDERS.GLIEDERUNG}
        />
      </BaseForm>
      
      <AntragSavePopup
        isOpen={isSavePopupOpen}
        onClose={() => setIsSavePopupOpen(false)}
        onConfirm={handleConfirmSave}
        isSaving={isSaving}
        antragstext={generatedAntrag}
        initialData={{ title: formData.idee }}
      />
      
      {displayedSources && displayedSources.trim() !== '' && generatedAntrag && generatedAntrag.trim() !== '' && (
        <div className="sources-container">
          <h3>Quellen</h3>
          <div className="sources-content">
            <pre>{displayedSources}</pre>
          </div>
        </div>
      )}
    </div>
  );
}; 