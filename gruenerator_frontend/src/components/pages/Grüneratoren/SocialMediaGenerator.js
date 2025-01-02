import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import { useSharedContent } from '../../../hooks/useSharedContent';
import { FaFacebook, FaInstagram, FaTwitter, FaLinkedin } from "react-icons/fa";
import StyledCheckbox from '../../common/AnimatedCheckbox';

const platformIcons = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  twitter: FaTwitter,
  linkedin: FaLinkedin
};

const SocialMediaGenerator = ({ showHeaderFooter = true }) => {
  const { initialContent } = useSharedContent();
  const [thema, setThema] = useState(initialContent.thema);
  const [details, setDetails] = useState(initialContent.details);
  const [platforms, setPlatforms] = useState({
    facebook: initialContent.isFromSharepic,
    instagram: initialContent.isFromSharepic,
    twitter: initialContent.isFromSharepic,
    linkedin: false,
    actionIdeas: false,
    reelScript: false 
  });

  const { submitForm, loading, success, resetSuccess } = useApiSubmit('/claude_social');
  const [error, setError] = useState('');
  const [useBackupProvider, setUseBackupProvider] = useState(false);
  const [generatedContent, setGeneratedContent] = useState({});

  const handleSubmit = useCallback(async () => {
    const selectedPlatforms = Object.keys(platforms).filter(key => platforms[key] && key !== 'actionIdeas');
    const formData = { 
      thema, 
      details, 
      platforms: selectedPlatforms, 
      includeActionIdeas: platforms.actionIdeas
    };
    try {
      const response = await submitForm(formData, useBackupProvider);
      if (response?.content) {
        setGeneratedContent(response.content);
        setTimeout(resetSuccess, 3000);
        setError('');
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err.message || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    }
  }, [thema, details, platforms, submitForm, resetSuccess, useBackupProvider]);

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

      <h3>Was & Wofür</h3>
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
              platform.charAt(0).toUpperCase() + platform.slice(1)
            }
          />
        ))}
      </div>
    </>
  );

  // Aktive Plattformen für die Anzeige
  const activePlatforms = Object.entries(platforms)
    .filter(([platform, isActive]) => isActive && platform !== 'actionIdeas')
    .map(([platform]) => platform);

  // Bestimme, ob wir Multi-Platform-Modus verwenden
  const isMultiPlatform = activePlatforms.length > 1;

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Social-Media Grünerator"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        isMultiPlatform={isMultiPlatform}
        platforms={activePlatforms}
        platformIcons={platformIcons}
        generatedContent={isMultiPlatform ? generatedContent : (generatedContent[activePlatforms[0]] || '')}
        useBackupProvider={useBackupProvider}
        setUseBackupProvider={setUseBackupProvider}
      >
        {renderFormInputs()}
      </BaseForm>
    </div>
  );
};

SocialMediaGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default SocialMediaGenerator;