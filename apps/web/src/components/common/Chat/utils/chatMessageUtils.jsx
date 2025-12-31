import React from 'react';

export const MESSAGE_MOTION_PROPS = {
  initial: { opacity: 0, y: 2, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" } },
  transition: { type: "tween", ease: "easeOut", duration: 0.35 }
};

export const MARKDOWN_COMPONENTS = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
};

export const handleEnterKeySubmit = (event, handleSubmit) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit(event);
  }
};
