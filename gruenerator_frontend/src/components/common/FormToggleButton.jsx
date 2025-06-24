import React from 'react';
import PropTypes from 'prop-types';
import { HiChevronLeft } from 'react-icons/hi';
// FormContext removed - no edit mode needed anymore
const FormCollapseButton = ({ isFormVisible, toggleForm }) => {
  // No edit mode check needed - always show button

  const handleClick = () => {
    toggleForm();
  };

  return (
    <button 
      className="form-collapse-button"
      onClick={handleClick}
      aria-label={isFormVisible ? "Formular ausblenden" : "Formular einblenden"}
      title={isFormVisible ? "Formular ausblenden" : "Formular einblenden"}
    >
      <HiChevronLeft className={`form-collapse-icon ${!isFormVisible ? 'collapsed' : ''}`} />
    </button>
  );
};

FormCollapseButton.propTypes = {
  isFormVisible: PropTypes.bool.isRequired,
  toggleForm: PropTypes.func.isRequired
};

export default FormCollapseButton; 