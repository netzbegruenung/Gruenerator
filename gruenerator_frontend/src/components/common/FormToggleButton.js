import React from 'react';
import PropTypes from 'prop-types';
import { HiSearch } from 'react-icons/hi';
import { useContext } from 'react';
import { FormContext } from '../utils/FormContext';

const FormToggleButton = ({ isEnabled, onToggle, className }) => {
  const { isEditing } = useContext(FormContext);

  if (isEditing) return null;

  return (
    <div className={`feature-toggle antrag-feature-toggle ${className || ''}`}>
      <label className="feature-switch">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={onToggle}
          aria-label="Webrecherche aktivieren"
        />
        <span className="feature-slider"></span>
      </label>
      <div className="feature-label">
        <HiSearch className="feature-icon" />
        Webrecherche aktivieren
      </div>
      <div className="feature-description">
        Aktiviere die automatische Webrecherche, um relevante Informationen zu deinem Antrag zu finden und einzubinden.
      </div>
    </div>
  );
};

FormToggleButton.propTypes = {
  isEnabled: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  className: PropTypes.string
};

export default FormToggleButton; 