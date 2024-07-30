// GeneratePostButton.js
import React from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";

const GeneratePostButton = ({ onGeneratePost, loading, text = "Beitragstext Grünerieren" }) => {
  return (
    <button 
      type="button" 
      className={`generate-post-button form-button ${loading ? 'loading' : ''}`} 
      onClick={onGeneratePost}
      aria-busy={loading}
    >
      <HiCog className={`icon ${loading ? 'loading-icon' : ''}`} />
      {loading ? '' : text}
    </button>
  );
};

GeneratePostButton.propTypes = {
  onGeneratePost: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  text: PropTypes.string,
};

export default GeneratePostButton;