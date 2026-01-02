import React, { JSX, AnchorHTMLAttributes } from 'react';
import type { Components } from 'react-markdown';

export const MESSAGE_MOTION_PROPS = {
  initial: { opacity: 0, y: 2, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" as const } },
  transition: { type: "tween" as const, ease: "easeOut" as const, duration: 0.35 }
};

export const MARKDOWN_COMPONENTS: Partial<Components> = {
  a: (props): JSX.Element => {
    const { node, ...rest } = props as AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };
    return <a {...rest} target="_blank" rel="noopener noreferrer" />;
  }
};

export const handleEnterKeySubmit = (event: React.KeyboardEvent, handleSubmit: (e: React.KeyboardEvent) => void): void => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit(event);
  }
};
