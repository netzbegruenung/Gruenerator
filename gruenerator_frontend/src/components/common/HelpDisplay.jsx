import React from 'react';
import PropTypes from 'prop-types';
const HelpDisplay = ({ content, tips }) => {
  return (
    <div className="help-display">
      <div className="help-content">
        <p>{content}</p>
        {tips && tips.length > 0 && (
          <>
            <h4>Tipps:</h4>
            <ul>
              {tips.map((tip, index) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

HelpDisplay.propTypes = {
  content: PropTypes.string.isRequired,
  tips: PropTypes.arrayOf(PropTypes.string)
};

HelpDisplay.defaultProps = {
  tips: []
};

export default HelpDisplay; 