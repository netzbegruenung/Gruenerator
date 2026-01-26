import { AssistantIcon } from '../../../config/icons';

import type { JSX } from 'react';

interface AssistantAvatarProps {
  avatarProps?: {
    type?: string;
    src?: string;
    alt?: string;
  };
  className?: string;
}

const AssistantAvatar = ({
  avatarProps,
  className = 'assistant-icon',
}: AssistantAvatarProps): JSX.Element => {
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

export default AssistantAvatar;
