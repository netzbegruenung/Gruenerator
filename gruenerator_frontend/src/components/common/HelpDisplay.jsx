import React from 'react';
import PropTypes from 'prop-types';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';

const HelpDisplay = ({ content, tips, forceHidden }) => {
  const { generatedText } = useGeneratedTextStore();
  
  // Hide if there's generated content, or force hidden
  const isHidden = forceHidden || 
                   (generatedText && generatedText.length > 0);

  if (!content || isHidden) {
    return null;
  }

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
  tips: PropTypes.arrayOf(PropTypes.string),
  forceHidden: PropTypes.bool
};

HelpDisplay.defaultProps = {
  tips: [],
  forceHidden: false
};

export default HelpDisplay; 