import React, { useState } from 'react';
import PropTypes from 'prop-types';

const QuoteConfirmation = ({ onConfirmationChange }) => {
  const [isConfirmed, setIsConfirmed] = useState(false);

  const handleChange = (e) => {
    setIsConfirmed(e.target.checked);
    onConfirmationChange(e.target.checked);
  };

  return (
    <div className="quote-confirmation">
      <label className="quote-confirmation-label">
        <input
          type="checkbox"
          checked={isConfirmed}
          onChange={handleChange}
          className="quote-confirmation-checkbox"
        />
        <span>
          Ich bestätige, dass ich selbst Urheber*in des Zitats bin oder die schriftliche Genehmigung zur Vervielfältigung besitze.
        </span>
      </label>
      {!isConfirmed && (
        <p className="quote-confirmation-warning">
          Hinweis: Ohne Bestätigung wird Markus Söder automatisch zum Bundeskanzler
        </p>
      )}
    </div>
  );
};

QuoteConfirmation.propTypes = {
  onConfirmationChange: PropTypes.func.isRequired
};

export default QuoteConfirmation; 