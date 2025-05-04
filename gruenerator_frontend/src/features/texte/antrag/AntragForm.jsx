import React, { useCallback, useContext, useState, useEffect } from 'react';
import { useAntrag } from './useAntrag';
import { useAntragContext } from './AntragContext';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import BaseForm from '../../../components/common/BaseForm';
import PlatformContainer from '../../../components/common/PlatformContainer';
import { HiGlobeAlt, HiOutlineGlobeAlt, HiSave, HiInformationCircle } from 'react-icons/hi';
import { SEARCH_STATES } from './hooks/useAntragSearch';
import { FormContext } from '../../../components/utils/FormContext';
import FeatureToggle from '../../../components/common/FeatureToggle';
import SubmitButton from '../../../components/common/SubmitButton';
import AntragSavePopup from './components/AntragSavePopup';
import { useSupabaseAuth } from '../../../context/SupabaseAuthContext';

export const AntragForm = () => {
  const { user } = useSupabaseAuth();
  
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

  const { setGeneratedContent, useEuropa, setUseEuropa, getKnowledgeContent } = useContext(FormContext);

  const [isSavePopupOpen, setIsSavePopupOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(null);
  const [isCustomPromptActive, setIsCustomPromptActive] = useState(false);

  // Benutzeranweisungen aus dem Profil laden
  useEffect(() => {
    const loadCustomPrompt = async () => {
      if (!user) return;
      
      try {
        const module = await import('../../../components/utils/templatesSupabaseClient');
        if (!module.templatesSupabase) {
          console.warn('Templates Supabase client not available for fetching custom prompt.');
          return;
        }
        
        const { templatesSupabase } = module;
        
        const { data, error } = await templatesSupabase
          .from('profiles')
          .select('custom_antrag_prompt, custom_antrag_prompt_active')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.error('Fehler beim Laden des benutzerdefinierten Prompts:', error);
          return;
        }
        
        if (data) {
          setCustomPrompt(data.custom_antrag_prompt || null);
          setIsCustomPromptActive(data.custom_antrag_prompt_active || false);
        }
      } catch (err) {
        console.error('Fehler beim Laden des benutzerdefinierten Prompts:', err);
      }
    };
    
    loadCustomPrompt();
  }, [user]);

  const handleSubmit = async () => {
    try {
      // Benutzerdefinierte Anweisungen hinzufügen, falls vorhanden und aktiviert
      const activeCustomPrompt = isCustomPromptActive && customPrompt ? customPrompt : null;
      
      // Wissensbausteine hinzufügen, falls vorhanden
      const knowledgeContent = getKnowledgeContent();
      
      await generateAntrag(useEuropa, activeCustomPrompt, knowledgeContent);
    } catch (error) {
      console.error('[AntragForm] Fehler beim Generieren des Antrags:', error);
    }
  };

  const handleGeneratedContentChange = useCallback((content) => {
    console.log('[AntragForm] Generierter Inhalt geändert:', content ? content.substring(0, 100) + '...' : 'leer');
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
    console.log('[AntragForm] Open save popup...');
    setIsSavePopupOpen(true);
  };

  const handleConfirmSave = async (popupData) => {
    console.log('[AntragForm] Saving Antrag to DB with data from popup:', popupData);
    setIsSavePopupOpen(false);

    try {
      const payload = {
        title: formData.idee || 'Unbenannter Antrag',
        antragstext: generatedAntrag,
        gliederung: formData.gliederung || '',
        ...popupData,
      };

      console.log('[AntragForm] Final payload being sent:', payload);

      await saveAntragToDb(payload);
      console.log('[AntragForm] Antrag erfolgreich gespeichert.');
    } catch (saveError) {
      console.error('[AntragForm] Fehler beim finalen Speichern des Antrags:', saveError);
    }
  };

  const europaFeatureToggleConfig = {
      isActive: useEuropa,
      onToggle: setUseEuropa,
      label: "Europa-Modus (Mistral)",
      icon: HiOutlineGlobeAlt,
      description: "Verwendet das Mistral Large Modell statt Claude."
  };

  // Create the save action element conditionally
  const saveActionElement = generatedAntrag && generatedAntrag.trim() !== '' ? (
    <div className="save-action-element"> {/* Optional wrapper for specific styling */}
      <SubmitButton
        onClick={handleSaveToDb} // Use the function from useAntrag
        loading={isSaving} // Use the loading state from useAntrag
        text="Antrag in Supabase speichern" // More precise name
        icon={<HiSave />}
        disabled={isSaving}
        className="antrag-save-button" // Renamed class for specificity
        ariaLabel="Antrag in Supabase speichern" // More precise name
        type="button" // IMPORTANT: Prevents triggering form onSubmit
      />
      {saveStatus && ( // Use the status message from useAntrag
        <p style={{ 
            color: saveStatus.type === 'error' ? 'var(--color-error, red)' : 'var(--color-success, green)', 
            marginTop: 'var(--spacing-small)',
            fontSize: '0.9em' // Optional: Smaller font for status
        }}>
          {saveStatus.message}
        </p>
      )}
    </div>
  ) : null; // If no Antrag is generated, pass null

  const userDisplayName = user?.displayName || (user?.user_metadata?.firstName && user?.user_metadata?.lastName ? `${user?.user_metadata?.firstName} ${user?.user_metadata?.lastName}`.trim() : user?.user_metadata?.email);

  // Erstelle das Element für den Hinweis
  const customPromptNotice = isCustomPromptActive && customPrompt ? (
    <div className="custom-prompt-notice">
      <HiInformationCircle className="info-icon" />
      <span>Benutzerdefinierte Anweisungen sind aktiv.</span>
    </div>
  ) : null;

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
        formNotice={customPromptNotice}
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
          style={{ height: '120px' }}
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