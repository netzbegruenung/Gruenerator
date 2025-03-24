import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import templateData from '../../templates/utils/templates.json';
import FilesSection from './FilesSection';
import TextsSection from './TextsSection';
import TemplatesSection from './TemplatesSection';
import Grueneratoren from './Grueneratoren';

const CampaignDashboard = ({ campaignData }) => {
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    try {
      // Filter Templates nach dem Kampagnen-Tag
      const filteredTemplates = templateData.templates.filter(template => 
        template.tags.some(tag => 
          tag.toLowerCase().includes(campaignData.campaignTag.toLowerCase())
        ) || 
        template.category.includes("wahlen")
      );
      
      setTemplates(filteredTemplates);
    } catch (err) {
      setError('Fehler beim Laden der Templates');
      console.error('Error loading templates:', err);
    }
  }, [campaignData.campaignTag]);

  if (error) {
    return <div className="campaign-error">{error}</div>;
  }

  return (
    <div className="campaign-dashboard">
      <FilesSection files={campaignData.files} className="files-section" />
      <TextsSection texts={campaignData.texts} className="texts-section" />
      <Grueneratoren />
      <TemplatesSection templates={templates} className="templates-section" />
    </div>
  );
};

CampaignDashboard.propTypes = {
  campaignData: PropTypes.shape({
    campaignTag: PropTypes.string.isRequired,
    files: PropTypes.array.isRequired,
    texts: PropTypes.array.isRequired
  }).isRequired
};

export default CampaignDashboard; 