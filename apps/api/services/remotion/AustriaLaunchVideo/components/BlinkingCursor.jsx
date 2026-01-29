import React from 'react';
import { useCurrentFrame } from 'remotion';

const BlinkingCursor = ({
  blinkInterval = 16,
  color = '#316049',
  height = '1.2em',
  width = '2px',
  style = {},
}) => {
  const frame = useCurrentFrame();

  const isVisible = Math.floor(frame / blinkInterval) % 2 === 0;

  return (
    <span
      style={{
        display: 'inline-block',
        width,
        height,
        backgroundColor: isVisible ? color : 'transparent',
        marginLeft: '2px',
        verticalAlign: 'text-bottom',
        ...style,
      }}
    />
  );
};

export default BlinkingCursor;
