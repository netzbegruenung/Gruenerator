import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import BaseForm from '../../common/BaseForm_social';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';

const SocialMediaGenerator = ({ showHeaderFooter = true }) => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [socialMediaPosts, setSocialMediaPosts] = useState({});
  const [platforms, setPlatforms] = useState({
    facebook: false,
    instagram: false,
    twitter: false,
    linkedin: false
  });
  const [includeActionIdeas, setIncludeActionIdeas] = useState(false);

  const textSize = useDynamicTextSize(
    Object.values(socialMediaPosts)
      .filter(post => typeof post === 'object')
      .map(post => post.content)
      .join('\n'), 
    1.2, 
    0.8, 
    [1000, 2000]
  );

  const { submitForm, loading, success, resetSuccess, error } = useApiSubmit('/claude_social');

  const handleSubmit = useCallback(async () => {
    const selectedPlatforms = Object.keys(platforms).filter(key => platforms[key]);
    const formData = { thema, details, platforms: selectedPlatforms, includeActionIdeas };
    try {
      const content = await submitForm(formData);
      if (content) {
        setSocialMediaPosts(content);
        setTimeout(resetSuccess, 3000);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  }, [thema, details, platforms, includeActionIdeas, submitForm, resetSuccess]);

  const handlePlatformChange = useCallback((platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  }, []);

  const handleGeneratePost = useCallback(async (platform) => {
    const formData = { thema, details, platforms: [platform], includeActionIdeas: false };
    try {
      const content = await submitForm(formData);
      if (content && content[platform]) {
        setSocialMediaPosts(prev => ({
          ...prev,
          [platform]: content[platform]
        }));
      }
    } catch (error) {
      console.error('Error regenerating post:', error);
    }
  }, [thema, details, includeActionIdeas, submitForm]);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Social-Media Grünerator"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={socialMediaPosts}
        textSize={textSize}
        onGeneratePost={handleGeneratePost}
      >
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

        <h3>Plattformen</h3>
        <div className="platform-checkboxes">
          {Object.keys(platforms).map((platform) => (
            <label key={platform} className="platform-checkbox">
              <input
                type="checkbox"
                checked={platforms[platform]}
                onChange={() => handlePlatformChange(platform)}
              />
              {platform.charAt(0).toUpperCase() + platform.slice(1)}
            </label>
          ))}
        </div>

        <label className="action-ideas-checkbox">
          <input
            type="checkbox"
            checked={includeActionIdeas}
            onChange={() => setIncludeActionIdeas(!includeActionIdeas)}
          />
          Aktionsideen einschließen
        </label>
      </BaseForm>
    </div>
  );
};

SocialMediaGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default SocialMediaGenerator;