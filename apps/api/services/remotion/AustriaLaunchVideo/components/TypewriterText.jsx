import React from 'react';
import { useCurrentFrame } from 'remotion';

const TypewriterText = ({
  text,
  startFrame = 0,
  framesPerChar = 3,
  style = {},
}) => {
  const frame = useCurrentFrame();

  const elapsedFrames = Math.max(0, frame - startFrame);
  const charsToShow = Math.floor(elapsedFrames / framesPerChar);
  const visibleText = text.slice(0, charsToShow);

  return (
    <span style={style}>
      {visibleText}
    </span>
  );
};

export default TypewriterText;
