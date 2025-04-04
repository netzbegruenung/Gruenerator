import React from 'react';
import CampaignDashboard from './CampaignDashboard';
// Remove AboutSection import and its CSS
// import AboutSection from './AboutSection';
import './AboutSection.css';

const WebinarCampaign = () => {

  // Define person data separately for clarity before merging
  const personDataExample = {
      name: "Moritz Wallraf",
      bio: "Moritz ist Experte für digitale Kommunikation und hilft grünen Initiativen, ihre Botschaften effektiv zu verbreiten. Bei Fragen zum Grünerator oder zur Öffentlichkeitsarbeit steht er gerne zur Verfügung.",
      imageUrl: "https://avatars.githubusercontent.com/u/101432780?v=4", 
      contact: {
          showForm: true,
          title: "Frage an Moritz?",
          buttonText: "Nachricht senden"
      }
  };

  const webinarData = {
    title: "Grünerator Webinare",
    description: "Hier findest du alle Materialien für unsere Webinar-Kampagne. Nutze die Vorlagen und Texte für eine erfolgreiche Bewerbung deiner Webinare.",
    campaignTag: "webinar",
    showGrueneratoren: false,
    showTemplates: true,
    showStandardTemplates: false,
    files: [
      {
        title: "Webinar Checkliste",
        description: "Schritt-für-Schritt Anleitung zur Webinar-Organisation",
        fileType: "pdf",
        url: "#"
      },
      {
        title: "Moderationsleitfaden",
        description: "Hilfreiche Tipps für die Webinar-Moderation",
        fileType: "docx",
        url: "#"
      }
    ],
    externalTemplates: [
      { 
        title: "Canva Vorlage - Webinar Ratsarbeit", 
        description: "Präsentationsvorlage für das Webinar zur Ratsarbeit", 
        url: "https://www.canva.com/design/DAGhoPHmgU8/dWYnEekTLuVaMu5fdpKJfA/view?utm_content=DAGhoPHmgU8&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h5e650a3b42",
        previewImage: null
      },
      { 
        title: "Canva Vorlage - Webinar Öffentlichkeitsarbeit", 
        description: "Präsentationsvorlage für das Webinar zur Öffentlichkeitsarbeit", 
        url: "https://www.canva.com/design/DAGYy-1qUz4/Lq4pZXJJ-pB2GynEvbgOBQ/view?utm_content=DAGYy-1qUz4&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=hd9ddb82e8a",
        previewImage: null
      }
    ],
    texts: [
      { 
        id: 1, 
        title: "Einladung Webinar Grünerator Öffentlichkeitsarbeit", 
        content: "🌱 Webinar: Grünerator für Öffentlichkeitsarbeit\n\nWann: [DATUM]\nWo: Online\n\nEntdecke den GRÜNERATOR: Dein smarter Assistent für grüne Öffentlichkeitsarbeit!\n\nDu möchtest Pressemitteilungen schneller erstellen oder deine Social-Media-Präsenz stärken? Der Grünerator macht's möglich! In unserem Webinar zeigen wir dir, wie du das KI-Tool optimal einsetzt, um deine Kommunikation effizienter, kreativer und zielgerichteter zu gestalten.\n\nEgal ob für Newsletter oder Social Media – der Grünerator ist dein digitaler Partner für die Öffentlichkeitsarbeit.\n\nJetzt anmelden: [LINK]\n\n#Grünerator #Öffentlichkeitsarbeit #Webinar" 
      },
      { 
        id: 2, 
        title: "Einladung Webinar Grünerator Ratsarbeit", 
        content: "🌱 Webinar: Grünerator für die Ratsarbeit\n\nWann: [DATUM]\nWo: Online\n\nEntdecke den GRÜNERATOR: Dein smarter Assistent für die Ratsarbeit!\n\nDu möchtest Anträge präzise prüfen oder Reden effizient vorbereiten? Der Grünerator macht's möglich! In unserem Webinar zeigen wir dir, wie du das KI-Tool optimal einsetzt, um deine Ratsarbeit effizienter und zielgerichteter zu gestalten.\n\nEgal ob für Anträge, Reden oder Wahlprogramme – der Grünerator ist dein digitaler Partner für die Ratsarbeit.\n\nJetzt anmelden: [LINK]\n\n#Grünerator #Ratsarbeit #Webinar" 
      }
    ],
    personData: personDataExample
  };

  // Example data for the AboutSection - moved into webinarData above
  /*
  const personDataExample = {
      name: "Moritz Wallraf",
      bio: "Moritz ist Experte für digitale Kommunikation und hilft grünen Initiativen, ihre Botschaften effektiv zu verbreiten. Bei Fragen zum Grünerator oder zur Öffentlichkeitsarbeit steht er gerne zur Verfügung.",
      imageUrl: "https://avatars.githubusercontent.com/u/101432780?v=4", 
      contact: {
          showForm: true, 
          title: "Frage an Moritz?", 
          buttonText: "Nachricht senden"
      }
  };
  */

  return (
    <div className="container with-header campaign-container">
      <div className="campaign-page">
        <div className="campaign-header">
          <h1>{webinarData.title}</h1>
          <p className="campaign-description">{webinarData.description}</p>
        </div>
        <CampaignDashboard campaignData={webinarData} />
        {/* Remove direct rendering of AboutSection */}
        {/* <AboutSection personData={personDataExample} /> */}
      </div>
    </div>
  );
};

export default WebinarCampaign; 