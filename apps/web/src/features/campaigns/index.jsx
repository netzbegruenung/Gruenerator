import React from 'react';
import CampaignDashboard from './components/CampaignDashboard';

const CampaignPage = () => {
  // Beispiel-Kampagnendaten
  const campaignData = {
    title: "Kommunalwahl 2025",
    description: "Unsere Kampagne für die Kommunalwahl 2025. Hier findest du alle wichtigen Materialien, Vorlagen und Texte für einen erfolgreichen Wahlkampf vor Ort.",
    campaignTag: "kommunalwahl", // Tag zum Filtern der Templates
    files: [
      { id: 1, title: "Wahlprogramm", description: "Unser vollständiges Wahlprogramm als PDF", fileType: "pdf", url: "#" },
      { id: 2, title: "Pressemitteilung", description: "Vorlage für Pressemitteilungen", fileType: "docx", url: "#" },
      { id: 3, title: "Kandidat:innen-Liste", description: "Übersicht aller Kandidierenden mit Kurzprofil", fileType: "pdf", url: "#" },
      { id: 4, title: "Wahlkampfhandbuch", description: "Leitfaden für den Wahlkampf vor Ort", fileType: "pdf", url: "#" }
    ],
    texts: [
      { id: 1, title: "Kurze Vorstellung", content: "Wir setzen uns für eine nachhaltige und gerechte Kommune ein. Mit unseren Kandidat:innen bringen wir frischen Wind in die Kommunalpolitik." },
      { id: 2, title: "Slogan", content: "Zukunft beginnt vor Ort - Grün für unsere Kommune" },
      { id: 3, title: "Social Media Text", content: "Am 15. März ist Kommunalwahl! Wählt Grün für eine lebenswerte Kommune mit sauberer Luft, bezahlbarem Wohnraum und guten Radwegen. #GrünWählen #Kommunalwahl2025" }
    ]
  };

  return (
    <div className="container with-header campaign-container">
      <div className="campaign-page">
        <div className="campaign-header">
          <h1>{campaignData.title}</h1>
          <p className="campaign-description">{campaignData.description}</p>
        </div>
        <CampaignDashboard campaignData={campaignData} />
      </div>
    </div>
  );
};

export default CampaignPage; 