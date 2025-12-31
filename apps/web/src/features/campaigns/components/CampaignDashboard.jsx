import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import FilesSection from './FilesSection';
import TextsSection from './TextsSection';
import TemplatesSection from './TemplatesSection';
import Grueneratoren from './Grueneratoren';
import AboutSection from './AboutSection';
import ContactFormSection from './ContactFormSection';

// Campaign Feature CSS - Loaded only when this feature is accessed
import './CampaignPage.css';
import './CampaignDashboard.css';
import './Grueneratoren.css';
import './TemplatesSection.css';
import './FileCard.css';
import './TextsSection.css';
import './FilesSection.css';
import './TextCard.css';
import '../styles/AboutSection.css';
import '../styles/ContactFormSection.css';

const CampaignDashboard = ({ campaignData }) => {
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(null);

  const { personData, texts, files, externalTemplates, showTemplates, showGrueneratoren, showStandardTemplates, campaignTag, contact: contactData } = campaignData;

  console.log('DEBUG - personData in CampaignDashboard:', personData);

  useEffect(() => {
    try {
      // Filter Templates nach dem Kampagnen-Tag
      let filteredTemplates = [];
      
      if (showStandardTemplates !== false) {
        filteredTemplates = templateData.templates.filter(template => 
          template.tags.some(tag => 
            tag.toLowerCase().includes(campaignTag.toLowerCase())
          ) || 
          template.category.includes("wahlen")
        );
      }
      
      setTemplates(filteredTemplates);
    } catch (err) {
      setError('Fehler beim Laden der Templates');
      console.error('Error loading templates:', err);
    }
  }, [campaignTag, showStandardTemplates]);

  if (error) {
    return <div className="campaign-error">{error}</div>;
  }

  return (
    <div className="campaign-dashboard">
      <TextsSection texts={texts} className="texts-section" />
      <div className="bottom-row">
        <FilesSection files={files} className="files-section" />
        {showTemplates !== false && (
          <TemplatesSection 
            templates={templates} 
            externalTemplates={externalTemplates || []}
            showStandardTemplates={showStandardTemplates}
            className="templates-section" 
          />
        )}
      </div>
      {showGrueneratoren !== false && (
        <div className="grueneratoren-container">
          <Grueneratoren />
        </div>
      )}
      {/* Wrapper div for About and Contact sections */}
      <div className="about-contact-wrapper">
        <AboutSection personData={personData} className="dashboard-section" />
        {contactData && contactData.showForm && (
          <ContactFormSection contactData={contactData} className="dashboard-section" />
        )}
      </div>
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
    externalTemplates: PropTypes.array,
    personData: PropTypes.shape({
        name: PropTypes.string,
        bio: PropTypes.string,
        imageUrl: PropTypes.string,
        contact: PropTypes.shape({
            showForm: PropTypes.bool,
            title: PropTypes.string,
            buttonText: PropTypes.string
        })
    }),
    contact: PropTypes.shape({
        showForm: PropTypes.bool,
        title: PropTypes.string,
        buttonText: PropTypes.string
    })
  }).isRequired
};

export default CampaignDashboard; 