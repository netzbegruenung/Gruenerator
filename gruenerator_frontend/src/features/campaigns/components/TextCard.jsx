import React from 'react';
import PropTypes from 'prop-types';
import CopyButton from '../../../components/common/CopyButton';

const TextCard = ({ text }) => {
  return (
    <div className="text-card">
      <div className="text-icon">💬</div>
      <div className="text-info">
        <h3>{text.title}</h3>
        <p className="text-content">{text.content}</p>
        <CopyButton content={text.content} compact={true} />
      </div>
    </div>
  );
};

TextCard.propTypes = {
  text: PropTypes.shape({
    title: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired
  }).isRequired
};

export default TextCard; 