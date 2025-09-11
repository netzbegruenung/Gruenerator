import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { FaCheckCircle } from 'react-icons/fa'; // Example using react-icons

const GeneratorCreationSuccessScreen = ({ name, slug, onRestart, onClose }) => {
  return (
    <div className="success-screen-container">
      <FaCheckCircle className="success-icon" />
      <h1>Erfolg!</h1>
      <p className="success-message">
        Dein Grünerator "<strong>{name}</strong>" wurde erfolgreich erstellt.
      </p>
      <div className="success-actions">
        <Link to={`/gruenerator/${slug}`} className="button button-primary button-large">
          Zum Grünerator
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className="button button-secondary button-large"
        >
          Weiteren erstellen
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="button button-tertiary button-large"
          >
            Zur Übersicht
          </button>
        )}
      </div>
    </div>
  );
};

GeneratorCreationSuccessScreen.propTypes = {
  name: PropTypes.string.isRequired,
  slug: PropTypes.string.isRequired,
  onRestart: PropTypes.func.isRequired,
  onClose: PropTypes.func,
};

export default GeneratorCreationSuccessScreen; 
