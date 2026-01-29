import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

const DARK_EUCALYPTUS = '#1e3d2f';

const AnimatedWord = ({ word, delay }) => {
  const frame = useCurrentFrame();

  // Simple staggered fade-in
  const opacity = interpolate(frame - delay, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <span
      style={{
        display: 'inline-block',
        opacity,
        marginRight: '0.25em',
      }}
    >
      {word}
    </span>
  );
};

const AnimatedLine = ({ text, delay }) => {
  const frame = useCurrentFrame();

  // Simple fade-in
  const opacity = interpolate(frame - delay, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        opacity,
        marginTop: '30px',
      }}
    >
      {text}
    </div>
  );
};

const Scene3ServusAustria = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const words1 = ['Der', 'Grünerator', 'sagt', 'Servus.'];
  const line2 = 'Jetzt auch in Österreich.';

  const wordDelay = 8;
  const line2Delay = 50;

  // Simple fade out in last 12 frames
  const exitStart = durationInFrames - 12;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: DARK_EUCALYPTUS,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '80px',
      }}
    >
      <div
        style={{
          fontSize: '72px',
          fontFamily: "'Raleway', Arial, sans-serif",
          fontWeight: 600,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.3,
          opacity: exitOpacity,
        }}
      >
        <div>
          {words1.map((word, i) => (
            <AnimatedWord
              key={i}
              word={word}
              delay={i * wordDelay}
            />
          ))}
        </div>
        <AnimatedLine text={line2} delay={line2Delay} />
      </div>
    </AbsoluteFill>
  );
};

export default Scene3ServusAustria;
