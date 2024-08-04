import React from 'react';
import PropTypes from 'prop-types';
import CopyButton from './CopyButton';
import GeneratePostButton from './GeneratePostButton';

const GeneratedPostContainer = ({ post, onGeneratePost, generatePostLoading, isSharepicGenerator }) => {
  if (!post) return null;

  return (
    <div className="generated-post-container">
      <p>{post}</p>
      <div className="button-container">
        <CopyButton 
          content={post} 
          text={isSharepicGenerator ? "Beitragstext kopieren" : "In die Zwischenablage kopieren"}
        />
        <GeneratePostButton
          onClick={onGeneratePost}
          loading={generatePostLoading}
          isRegenerateText={true}
        />
      </div>
    </div>
  );
};

GeneratedPostContainer.propTypes = {
  post: PropTypes.string,
  onGeneratePost: PropTypes.func.isRequired,
  generatePostLoading: PropTypes.bool,
  isSharepicGenerator: PropTypes.bool,
};

export default GeneratedPostContainer;