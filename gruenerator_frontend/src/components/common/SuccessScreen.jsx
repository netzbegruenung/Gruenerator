// gruenerator_frontend/src/components/common/SuccessScreen.jsx
import React from 'react';
import PropTypes from 'prop-types';

const SuccessScreen = ({ title, message, children }) => {
  return (
    <div className="success-screen-container">
      <div className="success-icon">
        {/* Optional: Add an SVG or icon font checkmark here */}
        <span>✔️</span> {/* Simple checkmark for now */}
      </div>
      {title && <h3 className="success-title">{title}</h3>}
      {message && <div className="success-message-content">{message}</div>}
      {children && <div className="success-actions">{children}</div>}
    </div>
  );
};

SuccessScreen.propTypes = {
  title: PropTypes.string,
  message: PropTypes.node, // Allow string or JSX elements (like <pre>)
  children: PropTypes.node, // For action buttons or other elements
};

export default SuccessScreen;