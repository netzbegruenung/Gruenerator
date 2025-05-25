import React, { useCallback, useContext, useState, useEffect } from 'react';
import { useAntrag } from './useAntrag';
import { useAntragContext } from './AntragContext';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import BaseForm from '../../../components/common/BaseForm';
import PlatformContainer from '../../../components/common/PlatformContainer';
import { HiGlobeAlt, HiOutlineGlobeAlt, HiSave, HiInformationCircle } from 'react-icons/hi';
import { SEARCH_STATES } from './hooks/useAntragSearch';
import { FormContext } from '../../../components/utils/FormContext';
import SubmitButton from '../../../components/common/SubmitButton';
import AntragSavePopup from './components/AntragSavePopup';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';
import { createFinalPrompt } from '../../../utils/promptUtils';
import useGroupDetails from '../../groups/hooks/useGroupDetails';

export const AntragForm = () => {
  const { user, deutschlandmodus } = useSupabaseAuth();
  
  const {
    formData,
    handleInputChange,
    generateAntrag,
    searchState,
    statusMessage,
    loading,
    error,
    isSaving,
    saveStatus,
    saveAntragToDb
  } = useAntrag();
  
  const { 
    generatedAntrag, 
    setGeneratedAntrag,
    useWebSearch, 
    setUseWebSearch,
    displayedSources
  } = useAntragContext();

  const { 
    setGeneratedContent, 
    useEuropa, 
    setUseEuropa, 
    getKnowledgeContent,
    knowledgeSourceConfig
  } = useContext(FormContext);

  const [isSavePopupOpen, setIsSavePopupOpen] = useState(false);
  const [userCustomAntragPrompt, setUserCustomAntragPrompt] = useState(null);
  const [isUserCustomAntragPromptActive, setIsUserCustomAntragPromptActive] = useState(false);

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

  const handleSubmit = async () => {
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
      const finalPrompt = createFinalPrompt(areInstructionsActive ? activeInstructionsText : null, knowledgeContent);
      
      if (finalPrompt) {
        console.log('[AntragForm] Final combined prompt for generateAntrag:', finalPrompt.substring(0, 100) + '...');
      } else {
        console.log('[AntragForm] No custom prompt or knowledge for generateAntrag.');
      }

      await generateAntrag(useEuropa, finalPrompt);
    } catch (submitError) {
      console.error('[AntragForm] Error submitting antrag:', submitError);
    }
  };

  const handleGeneratedContentChange = useCallback((content) => {
    setGeneratedAntrag(content);
    setGeneratedContent(content);
  }, [setGeneratedAntrag, setGeneratedContent]);

  const getButtonText = () => {
    if (loading) {
      if (searchState === SEARCH_STATES.GENERATING_QUERY) {
        return "Recherchiere...";
      } else if (searchState === SEARCH_STATES.SEARCHING) {
        return "Recherchiere...";
      } else if (searchState === SEARCH_STATES.GENERATING_ANTRAG) {
        return "Antrag wird generiert...";
      }
    }
    return "Antrag generieren";
  };

  const handleSaveToDb = async () => {
    setIsSavePopupOpen(true);
  };

  const handleConfirmSave = async (popupData) => {
    setIsSavePopupOpen(false);
    try {
      const payload = {
        title: formData.idee || 'Unbenannter Antrag',
        antragstext: generatedAntrag,
        gliederung: formData.gliederung || '',
        ...popupData,
      };
      await saveAntragToDb(payload);
    } catch (saveError) {
      console.error('[AntragForm] Error during final save of antrag:', saveError);
    }
  };

  const europaFeatureToggleConfig = {
      isActive: useEuropa,
      onToggle: setUseEuropa,
      label: "Europa-Modus (Mistral)",
      icon: HiOutlineGlobeAlt,
      description: "Verwendet das Mistral Large Modell statt Claude."
  };

  const saveActionElement = generatedAntrag && generatedAntrag.trim() !== '' ? (
    <div className="save-action-element">
      <SubmitButton
        onClick={handleSaveToDb}
        loading={isSaving}
        text="Antrag in Supabase speichern"
        icon={<HiSave />}
        disabled={isSaving}
        className="antrag-save-button"
        ariaLabel="Antrag in Supabase speichern"
        type="button"
      />
      {saveStatus && (
        <p className={`status-message-container ${saveStatus.type}`}>
          {saveStatus.message}
        </p>
      )}
    </div>
  ) : null;

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
      noticeParts.push("Deutschlandmodus (AWS) aktiv");
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

  return (
    <div className="container with-header">
      <BaseForm
        title="Grünerator für Anträge"
        onSubmit={handleSubmit}
        loading={loading}
        error={error}
        generatedContent={generatedAntrag}
        onGeneratedContentChange={handleGeneratedContentChange}
        allowEditing={true}
        submitButtonProps={{
          statusMessage: loading ? statusMessage : '',
          showStatus: true,
          defaultText: getButtonText(),
          loading: loading
        }}
        usePlatformContainers={true}
        disableAutoCollapse={true}
        featureToggle={{
          isActive: useWebSearch,
          onToggle: setUseWebSearch,
          label: "Webrecherche aktivieren",
          icon: HiGlobeAlt,
          description: "Aktiviere die automatische Webrecherche, um relevante Informationen zu deinem Antrag zu finden und einzubinden.",
          isSearching: searchState === SEARCH_STATES.SEARCHING,
          statusMessage: statusMessage
        }}
        useFeatureToggle={true}
        displayActions={saveActionElement}
        formNotice={formNoticeElement}
        enableEuropaModeToggle={true}
        enableKnowledgeSelector={true}
      >
        <h3><label htmlFor="idee">{FORM_LABELS.IDEE}</label></h3>
        <input
          id="idee"
          type="text"
          value={formData.idee}
          onChange={(e) => handleInputChange('idee', e.target.value)}
          placeholder={FORM_PLACEHOLDERS.IDEE}
          required
        />

        <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
        <textarea
          id="details"
          value={formData.details}
          onChange={(e) => handleInputChange('details', e.target.value)}
          placeholder={FORM_PLACEHOLDERS.DETAILS}
          className="form-textarea-large"
        />

        <h3><label htmlFor="gliederung">{FORM_LABELS.GLIEDERUNG}</label></h3>
        <input
          id="gliederung"
          type="text"
          value={formData.gliederung}
          onChange={(e) => handleInputChange('gliederung', e.target.value)}
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