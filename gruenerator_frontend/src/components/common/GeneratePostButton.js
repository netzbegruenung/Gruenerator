import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';
import { HiCog } from "react-icons/hi";
import { BUTTON_LABELS, ARIA_LABELS } from '../utils/constants';

const GeneratePostButton = ({ onGenerate, loading, isRegenerateText }) => {
  const handleClick = (event) => {
    event.preventDefault(); // Verhindert die Formularübermittlung
    event.stopPropagation(); // Stoppt die Event-Ausbreitung
    onGenerate();
  };

  return (
    <Button
      onClick={handleClick}
      loading={loading}
      text={isRegenerateText ? BUTTON_LABELS.REGENERATE_TEXT : BUTTON_LABELS.GENERATE_TEXT}
      icon={<HiCog />}
      className="generate-post-button"
      ariaLabel={isRegenerateText ? ARIA_LABELS.REGENERATE_TEXT : ARIA_LABELS.GENERATE_POST}
      type="button" // Explizit als Button-Typ deklarieren
    />
  );
};

GeneratePostButton.propTypes = {
  onGenerate: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  isRegenerateText: PropTypes.bool,
};

export default GeneratePostButton;