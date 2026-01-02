import '../styles/AboutSection.css'; // Pfad zum CSS anpassen, falls nötig

// Accept className as a prop
interface AboutSectionProps {
  personData?: {
    name?: string;
    bio?: string;
    imageUrl?: string
  };
  // Add className to propTypes
  className?: string;
}

const AboutSection = ({ personData, className }: AboutSectionProps): JSX.Element => {
  // Rendere nichts, wenn keine personData vorhanden ist
  if (!personData || !personData.name || !personData.bio || !personData.imageUrl) {
    console.log('AboutSection: No personData provided or incomplete.');
    return null;
  }

  console.log('AboutSection: Rendering with personData:', personData);

  return (
    // Combine the default 'about-section' with the passed className
    <div className={`about-section ${className || ''}`}>
      <h2>Über {personData.name}</h2>
      <div className="about-content">
        <img src={personData.imageUrl} alt={personData.name} className="about-image" />
        <div className="about-text">
          <p>{personData.bio}</p>
          {/* Optional: Weitere Infos wie Kontakt etc. könnten hier hin */}
        </div>
      </div>
    </div>
  );
};

export default AboutSection;
