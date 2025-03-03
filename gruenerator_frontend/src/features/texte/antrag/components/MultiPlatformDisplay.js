import React from 'react';
import PropTypes from 'prop-types';
import PlatformContainer from '../../../../components/common/PlatformContainer';

const MultiPlatformDisplay = ({ searchResults, antrag, sources }) => {
  return (
    <div className="multi-platform-display">
      {searchResults && (
        <div className="platform-item">
          <PlatformContainer content={searchResults} />
        </div>
      )}
      
      {antrag && (
        <div className="platform-item">
          <PlatformContainer content={antrag} />
        </div>
      )}
      
      {sources && (
        <div className="platform-item">
          <PlatformContainer content={sources} />
        </div>
      )}
    </div>
  );
};

MultiPlatformDisplay.propTypes = {
  searchResults: PropTypes.string,
  antrag: PropTypes.string,
  sources: PropTypes.string
};

export default MultiPlatformDisplay; 