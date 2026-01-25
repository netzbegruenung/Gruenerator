import type React from 'react';

export const MESSAGE_MOTION_PROPS = {
  initial: { opacity: 0, y: 2, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: {
    opacity: 0,
    y: -1,
    scale: 0.995,
    transition: { duration: 0.2, ease: 'easeOut' as const },
  },
  transition: { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.35 },
};

export const handleEnterKeySubmit = (
  event: React.KeyboardEvent,
  handleSubmit: (e: React.KeyboardEvent) => void
): void => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit(event);
  }
};
