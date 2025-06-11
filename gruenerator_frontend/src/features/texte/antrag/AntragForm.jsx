import React, { useCallback, useContext, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAntrag } from './useAntrag';
import { useAntragContext } from './AntragContext';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import BaseForm from '../../../components/common/BaseForm';
import PlatformContainer from '../../../components/common/PlatformContainer';
import { HiGlobeAlt, HiSave, HiInformationCircle } from 'react-icons/hi';
import { FormContext } from '../../../components/utils/FormContext';
import SubmitButton from '../../../components/common/SubmitButton';
import AntragSavePopup from './components/AntragSavePopup';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { createStructuredFinalPrompt } from '../../../utils/promptUtils';
import useGroupDetails from '../../groups/hooks/useGroupDetails';
import { useFormFields } from '../../../components/common/Form/hooks';
import useGeneratedTextStore from '../../../stores/generatedTextStore';

export const AntragForm = () => {
  const { user, betaFeatures } = useOptimizedAuth();
  const deutschlandmodus = betaFeatures?.deutschlandmodus;
  const { Input, Textarea } = useFormFields();
  const { setGeneratedText: setStoreGeneratedText, setIsLoading: setStoreIsLoading } = useGeneratedTextStore();
  
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

  const { 
    getKnowledgeContent,
    knowledgeSourceConfig
  } = useContext(FormContext);

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

  useEffect(() => {
    const loadUserCustomPrompt = async () => {
      if (!user) return;
      
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (!module.templatesSupabase) {
          console.warn('Templates Supabase client not available for fetching user custom prompt.');
          return;
        }
        
        const { templatesSupabase } = module;
        
        const { data, error: fetchError } = await templatesSupabase
          .from('profiles')
          .select('custom_antrag_prompt')
          .eq('id', user.id)
          .single();
        
        if (fetchError) {
          console.error('Error loading user custom antrag prompt:', fetchError);
          return;
        }
        
        if (data) {
          setUserCustomAntragPrompt(data.custom_antrag_prompt || null);
        }
      } catch (err) {
        console.error('Error loading user custom antrag prompt:', err);
      }
    };
    
    loadUserCustomPrompt();
  }, [user]);

  const { data: groupDetailsData, isLoading: isLoadingGroupDetails } = useGroupDetails(
    knowledgeSourceConfig.type === 'group' ? knowledgeSourceConfig.id : null,
    knowledgeSourceConfig.type === 'group'
  );

  const onSubmitRHF = async (rhfData) => {
    try {
      let activeInstructionsText = null;
      let areInstructionsActive = false;

      if (knowledgeSourceConfig.type === 'user') {
        activeInstructionsText = userCustomAntragPrompt;
        areInstructionsActive = isUserCustomAntragPromptActive;
      } else if (knowledgeSourceConfig.type === 'group' && groupDetailsData?.instructions) {
        activeInstructionsText = groupDetailsData.instructions.custom_antrag_prompt;
        areInstructionsActive = !!groupDetailsData.instructions.custom_antrag_prompt;
      }
      
      const knowledgeContent = getKnowledgeContent();
      const finalPrompt = createStructuredFinalPrompt(
        areInstructionsActive ? activeInstructionsText : null,
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
      await generateAntrag(finalPrompt);
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

  const userDisplayName = user?.displayName || (user?.user_metadata?.firstName && user?.user_metadata?.lastName ? `${user?.user_metadata?.firstName} ${user?.user_metadata?.lastName}`.trim() : user?.user_metadata?.email);

  const formNoticeElement = (() => {
    if (knowledgeSourceConfig.type === 'group' && isLoadingGroupDetails) {
      return (
        <div className="custom-prompt-notice">
          <HiInformationCircle className="info-icon" />
          <span>Lade Gruppenanweisungen & Wissen...</span>
        </div>
      );
    }

    let noticeParts = [];
    let activeInstructionsTextForNotice = null;
    let areInstructionsActiveForNotice = false;
    let instructionsAvailableForNotice = false;
    let sourceNameForNotice = "";

    if (knowledgeSourceConfig.type === 'user') {
      sourceNameForNotice = "Persönliche";
      activeInstructionsTextForNotice = userCustomAntragPrompt;
      areInstructionsActiveForNotice = isUserCustomAntragPromptActive && userCustomAntragPrompt;
      instructionsAvailableForNotice = !!userCustomAntragPrompt;
      if (areInstructionsActiveForNotice) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen`);
      } else if (instructionsAvailableForNotice) {
        noticeParts.push(`${sourceNameForNotice} Anweisungen (inaktiv)`);
      }
    } else if (knowledgeSourceConfig.type === 'group') {
      sourceNameForNotice = knowledgeSourceConfig.name || 'Gruppe';
      if (groupDetailsData?.instructions) {
        activeInstructionsTextForNotice = groupDetailsData.instructions.custom_antrag_prompt;
        areInstructionsActiveForNotice = !!groupDetailsData.instructions.custom_antrag_prompt;
        instructionsAvailableForNotice = !!groupDetailsData.instructions.custom_antrag_prompt;
        if (areInstructionsActiveForNotice) {
          noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}"`);
        } else if (instructionsAvailableForNotice) {
          noticeParts.push(`Anweisungen der Gruppe "${sourceNameForNotice}" (inaktiv)`);
        }
      }
    }

    const hasLoadedKnowledge = knowledgeSourceConfig.loadedKnowledgeItems && knowledgeSourceConfig.loadedKnowledgeItems.length > 0;

    if (knowledgeSourceConfig.type !== 'neutral' && hasLoadedKnowledge) {
      if (knowledgeSourceConfig.type === 'user') {
        noticeParts.push('gesamtes persönliches Wissen');
      } else if (knowledgeSourceConfig.type === 'group') {
        noticeParts.push(`gesamtes Wissen der Gruppe "${sourceNameForNotice}"`);
      }
    }

    if (deutschlandmodus === true) {
      noticeParts.push("Deutschlandmodus aktiv");
    }

    if (noticeParts.length === 0 && knowledgeSourceConfig.type === 'neutral') {
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
        usePlatformContainers={true}
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
          <PlatformContainer content={`QUELLEN: \n\n${displayedSources}`} />
        </div>
      )}
    </div>
  );
}; 