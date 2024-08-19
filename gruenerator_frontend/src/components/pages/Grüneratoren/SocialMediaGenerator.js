import React, { useState } from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/common/variables.css';
import '../../../assets/styles/common/global.css';
import '../../../assets/styles/components/button.css';
import '../../../assets/styles/pages/baseform.css';
import { useDynamicTextSize } from '../../utils/commonFunctions';
import useApiSubmit from '../../hooks/useApiSubmit';
import BaseForm from '../../common/BaseForm';
import { FORM_LABELS, FORM_PLACEHOLDERS } from '../../utils/constants';

const SocialMediaGenerator = ({ showHeaderFooter = true }) => {
  const [thema, setThema] = useState('');
  const [details, setDetails] = useState('');
  const [socialMediaPost, setSocialMediaPost] = useState('');
  const [platforms, setPlatforms] = useState({
    facebook: false,
    instagram: false,
    twitter: false,
    linkedin: false
  });

  const textSize = useDynamicTextSize(socialMediaPost, 1.2, 0.8, [1000, 2000]);
  const { submitForm, loading, success, error } = useApiSubmit('/claude_social');

  const handleSubmit = async () => {
    const selectedPlatforms = Object.keys(platforms).filter(key => platforms[key]);
    const formData = { thema, details, platforms: selectedPlatforms };
    const content = await submitForm(formData);
    if (content) setSocialMediaPost(content);
  };

  const handlePlatformChange = (platform) => {
    setPlatforms(prev => ({ ...prev, [platform]: !prev[platform] }));
  };

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Social-Media Grünerator"
        onSubmit={handleSubmit}
        loading={loading}
        success={success}
        error={error}
        generatedContent={socialMediaPost}
        textSize={textSize}
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
      </BaseForm>
    </div>
  );
};

SocialMediaGenerator.propTypes = {
  showHeaderFooter: PropTypes.bool
};

export default SocialMediaGenerator;