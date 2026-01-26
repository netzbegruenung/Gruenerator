import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import BlinkingCursor from '../components/BlinkingCursor';

const Scene2ResultCard = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Simple fade in over first 12 frames
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Typing timeline
  const line1 = 'Antragsteller*in:';
  const line2 = 'Die Grünen Wien';

  const typingStart = 15;
  const framesPerChar = 1.5;
  const pauseFrames = 30; // 1 second pause

  // Line 1: starts at frame 15
  const line1EndFrame = typingStart + (line1.length * framesPerChar);

  // Line 2: starts after line 1 + pause
  const line2StartFrame = line1EndFrame + pauseFrames;
  const line2EndFrame = line2StartFrame + (line2.length * framesPerChar);

  // Calculate visible characters for each line
  const line1Chars = Math.min(
    line1.length,
    Math.max(0, Math.floor((frame - typingStart) / framesPerChar))
  );

  const line2Chars = Math.min(
    line2.length,
    Math.max(0, Math.floor((frame - line2StartFrame) / framesPerChar))
  );

  const visibleLine1 = line1.slice(0, line1Chars);
  const visibleLine2 = line2.slice(0, line2Chars);

  // Cursor visibility
  const isTypingLine1 = frame >= typingStart && frame < line1EndFrame;
  const isTypingLine2 = frame >= line2StartFrame && frame < line2EndFrame;
  const showCursor = isTypingLine1 || isTypingLine2 || (frame >= line1EndFrame && frame < line2StartFrame);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(180deg, #F0F8F4 0%, #D8F0E6 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px',
      }}
    >
      {/* DIN A4 Paper document (ratio ~1:1.414) */}
      <div
        style={{
          opacity,
          backgroundColor: '#ffffff',
          width: '680px',
          height: '960px', // A4 ratio
          boxShadow: '0 4px 60px rgba(0, 0, 0, 0.15)',
          position: 'relative',
        }}
      >
        {/* Document content */}
        <div style={{ padding: '64px' }}>
          {/* Header */}
          <div
            style={{
              fontSize: '56px',
              fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
              fontWeight: 'bold',
              color: '#1a1a1a',
              marginBottom: '48px',
              lineHeight: 1.25,
            }}
          >
            Antrag auf Errichtung von drei Fahrradständern
          </div>

          {/* Typed content */}
          <div
            style={{
              fontSize: '38px',
              fontFamily: "'PTSans', 'PT Sans', Arial, sans-serif",
              color: '#333',
              lineHeight: 1.8,
            }}
          >
            <span>{visibleLine1}</span>
            {line1Chars === line1.length && visibleLine2.length > 0 && (
              <span style={{ fontWeight: 'bold', color: '#316049' }}> {visibleLine2}</span>
            )}
            {showCursor && (
              <BlinkingCursor
                color="#316049"
                height="44px"
                width="3px"
                blinkInterval={12}
              />
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene2ResultCard;
