import React from 'react';
import PropTypes from 'prop-types';
import CopyButton from './CopyButton';

const GeneratedPostContainer = ({ post, isSharepicGenerator }) => {
  if (!post) return null;

  return (
    <div className="generated-post-container">
      <p>{post}</p>
      <div className="button-container">
        <CopyButton 
          content={post} 
          text={isSharepicGenerator ? "Beitragstext kopieren" : "In die Zwischenablage kopieren"}
        />
      </div>
    </div>
  );
};

GeneratedPostContainer.propTypes = {
  post: PropTypes.string,
  isSharepicGenerator: PropTypes.bool,
};

export default GeneratedPostContainer;