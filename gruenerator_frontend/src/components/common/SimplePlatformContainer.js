import React from 'react';
import PropTypes from 'prop-types';
import '../../../assets/styles/components/platform-container.css';

const SimplePlatformContainer = ({ platform, children }) => {
  return (
    <div className="simple-platform-content">
      <div className="platform-header">
        <h3 className="platform-name">
          {platform.charAt(0).toUpperCase() + platform.slice(1)}
        </h3>
      </div>
      <div className="platform-body">
        {children}
      </div>
    </div>
  );
};

SimplePlatformContainer.propTypes = {
  platform: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

export default SimplePlatformContainer; 