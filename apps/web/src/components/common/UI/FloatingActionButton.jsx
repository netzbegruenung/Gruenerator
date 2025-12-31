import React from 'react';
import PropTypes from 'prop-types';
import './FloatingActionButton.css';

const FloatingActionButton = ({
  icon,
  onClick,
  visible = true,
  position = 'top-left',
  className = ''
}) => {
  if (!visible) return null;

  return (
    <button
      className={`floating-action-button floating-action-button--${position} ${className}`}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
};

FloatingActionButton.propTypes = {
  icon: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
  visible: PropTypes.bool,
  position: PropTypes.oneOf(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
  className: PropTypes.string
};

export default FloatingActionButton;
