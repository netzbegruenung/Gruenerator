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
      let filteredTemplates = [];
      
      if (campaignData.showStandardTemplates !== false) {
        filteredTemplates = templateData.templates.filter(template => 
          template.tags.some(tag => 
            tag.toLowerCase().includes(campaignData.campaignTag.toLowerCase())
          ) || 
          template.category.includes("wahlen")
        );
      }
      
      setTemplates(filteredTemplates);
    } catch (err) {
      setError('Fehler beim Laden der Templates');
      console.error('Error loading templates:', err);
    }
  }, [campaignData.campaignTag, campaignData.showStandardTemplates]);

  if (error) {
    return <div className="campaign-error">{error}</div>;
  }

  return (
    <div className="campaign-dashboard">
      <TextsSection texts={campaignData.texts} className="texts-section" />
      <div className="bottom-row">
        <FilesSection files={campaignData.files} className="files-section" />
        {campaignData.showTemplates !== false && (
          <TemplatesSection 
            templates={templates} 
            externalTemplates={campaignData.externalTemplates || []}
            showStandardTemplates={campaignData.showStandardTemplates}
            className="templates-section" 
          />
        )}
      </div>
      {campaignData.showGrueneratoren !== false && (
        <div className="grueneratoren-container">
          <Grueneratoren />
        </div>
      )}
    </div>
  );
};

CampaignDashboard.propTypes = {
  campaignData: PropTypes.shape({
    campaignTag: PropTypes.string.isRequired,
    files: PropTypes.array.isRequired,
    texts: PropTypes.array.isRequired,
    showGrueneratoren: PropTypes.bool,
    showTemplates: PropTypes.bool,
    showStandardTemplates: PropTypes.bool,
    externalTemplates: PropTypes.array
  }).isRequired
};

export default CampaignDashboard; 