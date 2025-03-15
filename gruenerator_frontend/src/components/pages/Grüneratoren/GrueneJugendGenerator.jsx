import React, { useState, useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../hooks/useSharedContent';
import StyledCheckbox from '../../common/AnimatedCheckbox';
import { FormContext } from '../../utils/FormContext';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import ErrorBoundary from '../../ErrorBoundary';

const GrueneJugendGenerator = ({ showHeaderFooter = true }) => {
  const { initialContent } = useSharedContent();
  const [thema, setThema] = useState(initialContent.thema);
  const [details, setDetails] = useState(initialContent.details);
  const [platforms, setPlatforms] = useState({
    instagram: initialContent.isFromSharepic,
    twitter: initialContent.isFromSharepic,
    tiktok: false,
    messenger: false,
    reelScript: false,
    actionIdeas: false
  });
  const [socialMediaContent, setSocialMediaContent] = useState('');
  const textSize = useDynamicTextSize(socialMediaContent, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_gruene_jugend');
  const { setGeneratedContent } = useContext(FormContext);
  const [useBackupProvider, setUseBackupProvider] = useState(false);

  const handleSubmit = useCallback(async () => {
    const selectedPlatforms = Object.keys(platforms).filter(key => platforms[key]);

    const formData = { 
      thema, 
      details, 
      platforms: selectedPlatforms
    };

    console.log('[GrueneJugendGenerator] Sende Formular mit Daten:', formData);
    try {
      const content = await submitForm(formData, useBackupProvider);
      console.log('[GrueneJugendGenerator] API Antwort erhalten:', content);
      if (content) {
        console.log('[GrueneJugendGenerator] Setze generierten Content:', content.substring(0, 100) + '...');
        setSocialMediaContent(content);
        setGeneratedContent(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (err) {
      console.error('[GrueneJugendGenerator] Fehler beim Formular-Submit:', err);
    }
  }, [thema, details, platforms, submitForm, resetSuccess, setGeneratedContent, useBackupProvider]);

  const handleGeneratedContentChange = useCallback((content) => {
    console.log('[GrueneJugendGenerator] Content Change Handler aufgerufen mit:', content?.substring(0, 100) + '...');
    setSocialMediaContent(content);
    setGeneratedContent(content);
  }, [setGeneratedContent]);

  const handlePlatformChange = useCallback((platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  }, []);

  const renderFormInputs = () => (
    <>
      <h3><label htmlFor="thema">{FORM_LABELS.THEME}</label></h3>
      <input
        id="thema"
        type="text"
        name="thema"
        placeholder={FORM_PLACEHOLDERS.THEME}
        value={thema}
        onChange={(e) => setThema(e.target.value)}
        aria-required="true"
      />

      <h3><label htmlFor="details">{FORM_LABELS.DETAILS}</label></h3>
      <textarea
        id="details"
        name="details"
        style={{ height: '120px' }}
        placeholder={FORM_PLACEHOLDERS.DETAILS}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        aria-required="true"
      />

      <h3>Plattformen & Formate</h3>
      <div className="platform-checkboxes">
        {Object.entries(platforms).map(([platform, isChecked]) => (
          <StyledCheckbox
            key={platform}
            id={`checkbox-${platform}`}
            checked={isChecked}
            onChange={() => handlePlatformChange(platform)}
            label={
              platform === 'actionIdeas' ? 'Aktionsideen' :
              platform === 'reelScript' ? 'Instagram Reel' :
              platform === 'tiktok' ? 'TikTok' :
              platform === 'messenger' ? 'Messenger' :
              platform.charAt(0).toUpperCase() + platform.slice(1)
            }
          />
        ))}
      </div>
    </>
  );

  return (
    <ErrorBoundary>
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <BaseForm
          title="Grüne Jugend"
          onSubmit={handleSubmit}
          loading={loading}
          success={success}
          error={error}
          generatedContent={socialMediaContent}
          textSize={textSize}
          onGeneratedContentChange={handleGeneratedContentChange}
          useBackupProvider={useBackupProvider}
          setUseBackupProvider={setUseBackupProvider}
          usePlatformContainers={true}
        >
          {renderFormInputs()}
        </BaseForm>
      </div>
    </ErrorBoundary>
  );
};

GrueneJugendGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default GrueneJugendGenerator; 