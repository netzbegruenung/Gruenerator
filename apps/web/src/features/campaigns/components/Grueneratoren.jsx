import React from 'react';
const Grueneratoren = () => {
  const handleButtonClick = (generatorName) => {
    console.log(`Grünerator "${generatorName}" wurde geklickt`);
    // Hier später die Navigation oder Aktion implementieren
  };

  return (
    <section className="dashboard-section grueneratoren-container">
      <h2>Muster-Grüneratoren</h2>
      <div className="grueneratoren-grid">
        <button 
          className="gruenerator-button"
          onClick={() => handleButtonClick("Pressemitteilung")}
        >
          <div className="gruenerator-icon">📰</div>
          <span className="gruenerator-name">Pressemitteilung</span>
        </button>

        <button 
          className="gruenerator-button"
          onClick={() => handleButtonClick("Social Media Post")}
        >
          <div className="gruenerator-icon">📱</div>
          <span className="gruenerator-name">Social Media Post</span>
        </button>

        <button 
          className="gruenerator-button"
          onClick={() => handleButtonClick("Wahlkampfrede")}
        >
          <div className="gruenerator-icon">🎤</div>
          <span className="gruenerator-name">Wahlkampfrede</span>
        </button>

        <button 
          className="gruenerator-button"
          onClick={() => handleButtonClick("Flyer-Text")}
        >
          <div className="gruenerator-icon">📄</div>
          <span className="gruenerator-name">Flyer-Text</span>
        </button>
      </div>
    </section>
  );
};

export default Grueneratoren; 