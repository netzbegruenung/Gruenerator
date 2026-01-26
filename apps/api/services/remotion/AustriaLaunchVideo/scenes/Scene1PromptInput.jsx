import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import MockFormCard from '../components/MockFormCard';

const PROMPT_TEXT = 'Ich möchte einen Antrag für 3 neue Fahrradständer in der Hauptstadt erstellen';

const Scene1PromptInput = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Exit transition - simple fade out in last 12 frames
  const exitStart = durationInFrames - 12;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #F0F8F4 0%, #D8F0E6 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          opacity: exitOpacity,
        }}
      >
        <MockFormCard
          text={PROMPT_TEXT}
          startFrame={0}
          typingStartFrame={30}
          framesPerChar={0.9}
        />
      </div>
    </AbsoluteFill>
  );
};

export default Scene1PromptInput;
