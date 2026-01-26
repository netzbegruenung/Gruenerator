import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import TypewriterText from './TypewriterText';
import BlinkingCursor from './BlinkingCursor';

const MockFormCard = ({
  text,
  startFrame = 0,
  typingStartFrame = 30,
  framesPerChar = 3,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entranceProgress = spring({
    frame: frame - startFrame,
    fps,
    config: {
      damping: 15,
      stiffness: 80,
    },
  });

  const translateY = (1 - entranceProgress) * 100;
  const opacity = entranceProgress;

  const isTypingComplete = frame >= typingStartFrame + (text.length * framesPerChar);

  return (
    <div
      style={{
        transform: `translateY(${translateY}px)`,
        opacity,
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        padding: '48px',
        width: '750px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        border: '1px solid #e0e0e0',
      }}
    >
      <div
        style={{
          marginBottom: '24px',
          fontSize: '20px',
          fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
          color: '#666',
          fontWeight: 'bold',
        }}
      >
        Was soll erstellt werden?
      </div>

      {/* Square input area */}
      <div
        style={{
          backgroundColor: '#f8f9fa',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          aspectRatio: '1 / 1',
          border: '3px solid #316049',
          display: 'flex',
          alignItems: 'flex-start',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: '64px',
            fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
            color: '#464646',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}
        >
          <TypewriterText
            text={text}
            startFrame={typingStartFrame}
            framesPerChar={framesPerChar}
          />
          {!isTypingComplete && (
            <BlinkingCursor
              color="#316049"
              height="72px"
              width="4px"
            />
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: '32px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <div
          style={{
            backgroundColor: '#316049',
            color: '#ffffff',
            padding: '16px 40px',
            borderRadius: '12px',
            fontSize: '24px',
            fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
            fontWeight: 'bold',
          }}
        >
          Grünerieren
        </div>
      </div>
    </div>
  );
};

export default MockFormCard;
