// UnsplashButton.js
import React from 'react';
import PropTypes from 'prop-types';
import { SiUnsplash } from "react-icons/si";
import Button from './Button';
import { BUTTON_LABELS, ARIA_LABELS } from '../utils/constants';

const UnsplashButton = ({ onClick, loading }) => {
    const handleClick = (event) => {
      console.log('UnsplashButton clicked'); // Beibehaltenes Log
      event.preventDefault();  // Verhindert das Standard-Formular-Submit-Event
      event.stopPropagation(); // Stoppt die Event-Propagation
      console.log('Calling onClick function'); // Beibehaltenes Log
      onClick();
      console.log('onClick function called'); // Beibehaltenes Log
    };
    
    console.log('Rendering UnsplashButton, loading:', loading); // Beibehaltenes Log
    
    return (
      <Button
        onClick={handleClick}
        loading={loading}
        text={BUTTON_LABELS.UNSPLASH_SELECT}
        icon={<SiUnsplash />}
        className="unsplash-button"
        ariaLabel={ARIA_LABELS.UNSPLASH_SELECT}
        type="button" // Wichtig: Dies verhindert, dass der Button als Submit-Button fungiert
      />
    );
  };
    
UnsplashButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

export default UnsplashButton;