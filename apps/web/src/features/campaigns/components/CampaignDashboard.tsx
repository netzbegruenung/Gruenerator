import { useState, useEffect } from 'react';
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

interface CampaignDashboardProps {
  campaignData: {
    campaignTag?: string;
    files: unknown[];
    texts: unknown[];
    showGrueneratoren?: boolean;
    showTemplates?: boolean;
    showStandardTemplates?: boolean;
    externalTemplates?: unknown[];
    personData?: {
    name?: string;
    bio?: string;
    imageUrl?: string;
    contact?: {
    showForm?: boolean;
    title?: string;
    buttonText?: string
  }
  };
    contact?: {
    showForm?: boolean;
    title?: string;
    buttonText?: string
  }
  };
}

const CampaignDashboard = ({ campaignData }: CampaignDashboardProps): JSX.Element => {
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

export default CampaignDashboard;
