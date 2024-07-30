// Button.js
import React from 'react';
import PropTypes from 'prop-types';

const Button = ({ onClick, loading, success, text, icon, className, ariaLabel }) => (
  <button 
    onClick={onClick} 
    className={`button ${className} ${loading ? 'loading' : ''}`} 
    aria-busy={loading}
    aria-label={ariaLabel}
  >
    {icon && <span className={`icon ${loading ? 'loading-icon' : ''}`}>{icon}</span>}
    {loading ? '' : (success ? <svg className="checkmark" viewBox="0 0 24 24">
      <path d="M20 6L9 17l-5-5" />
    </svg> : text)}
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