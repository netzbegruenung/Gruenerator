import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm_social';
import '../../../assets/styles/pages/baseform_social.css';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import useApiSubmit from '../../hooks/useApiSubmit';
import useEditFunctionality from '../../hooks/useEditFunctionality';
import { FaFacebook, FaInstagram, FaTwitter, FaLinkedin } from "react-icons/fa";
import StyledCheckbox from '../../common/AnimatedCheckbox';  // Importieren Sie die AnimatedCheckbox-Komponente
import BackupToggle from '../../common/BackupToggle';  // BackupToggle importieren

const platformIcons = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  twitter: FaTwitter,
  linkedin: FaLinkedin
};

const SocialMediaGenerator = ({ showHeaderFooter = true }) => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [platforms, setPlatforms] = useState({
    facebook: false,
    instagram: false,
    twitter: false,
    linkedin: false,
    actionIdeas: false,
    reelScript: false 
  });

  const { submitForm, loading, success, resetSuccess } = useApiSubmit('/claude_social');

  const [error, setError] = useState('');
  
  const {
    posts: socialMediaPosts,
    setPosts: setSocialMediaPosts,
    editingPlatform,
    handleEditPost,
    handleSavePost,
    handlePostContentChange
  } = useEditFunctionality({});

  const [useBackupProvider, setUseBackupProvider] = useState(false);

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
      if (response && response.content) {
        setSocialMediaPosts(response.content);
        setTimeout(resetSuccess, 3000);
        setError('');
      }
    } catch (err) {
      console.error('Error submitting form:', err);
      setError(err.message || 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    }
  }, [thema, details, platforms, submitForm, resetSuccess, setSocialMediaPosts, useBackupProvider]);

  const handlePlatformChange = useCallback((platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  }, []);

  const handleGeneratePost = useCallback(async (platform) => {
    const formData = { 
      thema, 
      details, 
      platforms: platform === 'actionIdeas' ? [] : [platform], 
      includeActionIdeas: platform === 'actionIdeas'
    };
    try {
      const response = await submitForm(formData, useBackupProvider);
      if (response && response.content) {
        setSocialMediaPosts(prev => ({
          ...prev,
          ...(platform === 'actionIdeas' 
            ? { actionIdeas: response.content.actionIdeas } 
            : { [platform]: response.content[platform] })
        }));
      }
    } catch (error) {
      console.error('Error regenerating post:', error);
      setError(error.message || 'Ein Fehler ist aufgetreten beim Regenerieren des Posts.');
    }
  }, [thema, details, submitForm, setSocialMediaPosts, useBackupProvider]);

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
      ></textarea>

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

      <BackupToggle 
        useBackupProvider={useBackupProvider}
        setUseBackupProvider={setUseBackupProvider}
      />
    </>
  );

  return (
    <div className={`container social-media-baseform ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Social-Media Grünerator"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={socialMediaPosts}
        onGeneratePost={handleGeneratePost}
        renderFormInputs={renderFormInputs}
        editingPlatform={editingPlatform}
        handleEditPost={handleEditPost}
        handleSavePost={handleSavePost}
        handlePostContentChange={handlePostContentChange}
        platformIcons={platformIcons}
        includeActionIdeas={platforms.actionIdeas}
      />
    </div>
  );
};

SocialMediaGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default SocialMediaGenerator;