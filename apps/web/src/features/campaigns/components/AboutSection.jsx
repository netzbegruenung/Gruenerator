import React from 'react';
import PropTypes from 'prop-types';
import '../styles/AboutSection.css'; // Pfad zum CSS anpassen, falls nötig

// Accept className as a prop
const AboutSection = ({ personData, className }) => {
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

AboutSection.propTypes = {
  personData: PropTypes.shape({
    name: PropTypes.string,
    bio: PropTypes.string,
    imageUrl: PropTypes.string,
  }),
  // Add className to propTypes
  className: PropTypes.string,
};

// Setze defaultProps auf null, um sicherzustellen, dass die Komponente nicht rendert,
// wenn personData nicht explizit übergeben wird (obwohl die Prüfung oben das schon abfängt).
AboutSection.defaultProps = {
  personData: null,
  // Default className to empty string
  className: '',
};


export default AboutSection; 