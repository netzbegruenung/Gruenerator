import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { useContext } from 'react';
import { FormContext } from '../utils/FormContext';

const FormToggleButton = ({ isFormVisible, toggleForm }) => {
  const { isEditing } = useContext(FormContext);

  // Wenn der Editor aktiv ist, rendere nichts
  if (isEditing) return null;

  const button = (
    <button
      className={`form-toggle-button ${isFormVisible ? 'form-visible' : ''}`}
      onClick={toggleForm}
      aria-label={isFormVisible ? 'Formular ausblenden' : 'Formular einblenden'}
    >
      {isFormVisible ? <HiChevronLeft size={24} /> : <HiChevronRight size={24} />}
    </button>
  );

  return ReactDOM.createPortal(
    button,
    document.body
  );
};

FormToggleButton.propTypes = {
  isFormVisible: PropTypes.bool.isRequired,
  toggleForm: PropTypes.func.isRequired
};

export default FormToggleButton; 