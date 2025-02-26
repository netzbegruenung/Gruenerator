import React, { useCallback } from 'react';
import { useAntrag } from './useAntrag';
import { useAntragContext } from './AntragContext';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../../components/utils/constants';
import BaseForm from '../../../components/common/BaseForm';
import PlatformContainer from '../../../components/common/PlatformContainer';
import { HiGlobeAlt } from 'react-icons/hi';
import { SEARCH_STATES } from './hooks/useAntragSearch';
import './styles/antrag-form.css';

export const AntragForm = () => {
  const {
    formData,
    handleInputChange,
    generateAntrag,
    searchState,
    statusMessage,
    loading,
    error
  } = useAntrag();
  
  const { 
    generatedAntrag, 
    setGeneratedAntrag,
    useWebSearch, 
    setUseWebSearch,
    displayedSources
  } = useAntragContext();

  const handleSubmit = async () => {
    try {
      await generateAntrag();
    } catch (error) {
      console.error('[AntragForm] Fehler beim Generieren des Antrags:', error);
    }
  };

  // Behandelt Änderungen am generierten Inhalt
  const handleGeneratedContentChange = useCallback((content) => {
    console.log('[AntragForm] Generierter Inhalt geändert:', content ? content.substring(0, 100) + '...' : 'leer');
    setGeneratedAntrag(content);
  }, [setGeneratedAntrag]);

  // Vereinfachter Button-Text
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

  return (
    <>
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
      
      {/* Quellenanzeige unter dem Antrag */}
      {displayedSources && displayedSources.trim() !== '' && generatedAntrag && generatedAntrag.trim() !== '' && (
        <div className="sources-container">
          <h3>Quellen</h3>
          <PlatformContainer content={`QUELLEN: \n\n${displayedSources}`} />
        </div>
      )}
    </>
  );
}; 