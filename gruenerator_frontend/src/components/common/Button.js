import React from 'react';
import PropTypes from 'prop-types';
import Lottie from 'react-lottie-player';

// Importieren Sie die Lottie-Animation und loggen Sie den Import
let lottie_checkmark;
try {
  lottie_checkmark = require('../../assets/lotties/lottie_checkmark.json');
  console.log('Lottie animation imported successfully');
} catch (error) {
  console.error('Failed to import Lottie animation:', error);
}

const Button = ({ onClick, loading, success, text, icon, className, ariaLabel }) => (
  <button
    onClick={onClick}
    className={`button ${className} ${loading ? 'loading' : ''}`}
    aria-busy={loading}
    aria-label={ariaLabel}
  >
    {success && lottie_checkmark ? (
      <Lottie
        animationData={lottie_checkmark}
        play
        loop={false}
        style={{ width: 35, height: 35 }}
      />
    ) : (
      icon && <span className={`icon ${loading ? 'loading-icon' : ''}`}>{icon}</span>
    )}
    {text}
  </button>
);

Button.propTypes = {
  onClick: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  success: PropTypes.bool,
  text: PropTypes.string,
  icon: PropTypes.node,
  className: PropTypes.string,
  ariaLabel: PropTypes.string
};

Button.defaultProps = {
  loading: false,
  success: false,
  text: '',
  icon: null,
  className: '',
  ariaLabel: ''
};

export default Button;