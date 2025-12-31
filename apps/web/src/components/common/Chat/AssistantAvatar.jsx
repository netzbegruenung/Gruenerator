import React from 'react';
import PropTypes from 'prop-types';
import { AssistantIcon } from '../../../config/icons';

const AssistantAvatar = ({ avatarProps, className = 'assistant-icon' }) => {
  if (!avatarProps) {
    return <AssistantIcon className={className} />;
  }

  if (avatarProps.type === 'robot') {
    return (
      <div className="assistant-icon-wrapper">
        <img
          src={avatarProps.src}
          alt={avatarProps.alt}
          className={`${className} assistant-robot-image`}
        />
      </div>
    );
  }

  return <AssistantIcon className={className} />;
};

AssistantAvatar.propTypes = {
  avatarProps: PropTypes.shape({
    type: PropTypes.string,
    src: PropTypes.string,
    alt: PropTypes.string
  }),
  className: PropTypes.string
};

export default AssistantAvatar;
