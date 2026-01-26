import React from 'react';
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

// Primary color (Deep moss green) from variables.css
const PRIMARY_600 = '#316049';

// Neutral color (Sand) from variables.css
const SAND = '#F5F1E9';

// Animated star with beautiful drifting effect + forms wheel at end
const FloatingStar = ({ x, y, size, delay, floatOffset = 0, convergeStart = 80, index, totalStars }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animation
  const enterProgress = spring({
    frame: frame - delay,
    fps,
    config: {
      damping: 12,
      stiffness: 80,
    },
  });

  // Convergence animation starts at convergeStart frame
  const convergeProgress = spring({
    frame: frame - convergeStart,
    fps,
    config: {
      damping: 15,
      stiffness: 150,
    },
  });

  // Beautiful star drift - visible, graceful movement
  // Parallax: larger stars appear closer and move more
  const parallax = size / 150;
  const baseAmplitude = 50 * parallax;

  // Much slower time factor for graceful movement
  const t = (frame + floatOffset) * 0.02;

  // Directional drift - each star has a unique direction based on its index
  const driftAngle = (index / totalStars) * Math.PI * 2;
  const driftX = Math.cos(driftAngle) * frame * 0.3;
  const driftY = Math.sin(driftAngle) * frame * 0.25;

  // Smooth oscillation overlay for organic feel
  const oscX = Math.sin(t) * baseAmplitude * 0.6;
  const oscY = Math.cos(t * 0.8 + index) * baseAmplitude * 0.8;

  // Combined movement - drift + oscillation, fades during convergence
  const floatX = (driftX + oscX) * (1 - convergeProgress);
  const floatY = (driftY + oscY) * (1 - convergeProgress);

  // Gentle rotation as stars drift (3-6 degrees over scene duration)
  const floatRotation = interpolate(
    frame,
    [0, 120],
    [0, 3 + index * 0.4],
    { extrapolateRight: 'clamp' }
  ) * (1 - convergeProgress);

  // Calculate wheel position - converge to where the cog will be in Scene 6
  // The cog is part of "Grünerat[cog]r" - slightly right of center
  const cogCenterX = 595;
  const cogCenterY = 540;
  const wheelRadius = 180;
  const angleOffset = (index / totalStars) * Math.PI * 2;

  // No rotation in Scene 5 - stars just form a static circle
  const wheelAngle = angleOffset;

  const wheelX = cogCenterX + Math.cos(wheelAngle) * wheelRadius;
  const wheelY = cogCenterY + Math.sin(wheelAngle) * wheelRadius;

  // Position - move from original to wheel position
  const currentX = interpolate(convergeProgress, [0, 1], [x + floatX, wheelX], {
    extrapolateRight: 'clamp',
  });
  const currentY = interpolate(convergeProgress, [0, 1], [y + floatY, wheelY], {
    extrapolateRight: 'clamp',
  });

  // Scale - normalize sizes when forming wheel (no pulse, just clean drift)
  const targetSize = 80;
  const scaleRatio = targetSize / size;
  const convergeScale = interpolate(convergeProgress, [0, 1], [1, scaleRatio], {
    extrapolateRight: 'clamp',
  });
  const scale = enterProgress * convergeScale;

  const opacity = enterProgress;

  return (
    <div
      style={{
        position: 'absolute',
        left: currentX,
        top: currentY,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${floatRotation}deg)`,
        opacity,
        fontSize: size,
        color: SAND,
        textShadow: '0 0 20px rgba(245, 241, 233, 0.5)',
      }}
    >
      ★
    </div>
  );
};

const Scene5Europe = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Simple fade in over first 12 frames
  const entranceOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Content animation
  const contentDelay = 10;
  const contentProgress = spring({
    frame: frame - contentDelay,
    fps,
    config: {
      damping: 12,
      stiffness: 100,
    },
  });

  const headlineY = interpolate(contentProgress, [0, 1], [40, 0], {
    extrapolateRight: 'clamp',
  });

  const subtextProgress = spring({
    frame: frame - contentDelay - 15,
    fps,
    config: {
      damping: 15,
      stiffness: 80,
    },
  });

  // No convergence in Scene 5 - stars just float, Scene 6 handles the full animation
  const convergeStart = 999;
  const contentFadeOut = interpolate(frame, [convergeStart, convergeStart + 20], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 8 stars - big, dynamic asymmetric positions with natural floating
  // floatOffset staggers the oscillation phase for variety
  const starsData = [
    { x: 80, y: 120, size: 160, delay: 0, floatOffset: 0 },
    { x: 950, y: 80, size: 180, delay: 1, floatOffset: 120 },
    { x: 1020, y: 450, size: 140, delay: 2, floatOffset: 240 },
    { x: 920, y: 950, size: 170, delay: 1, floatOffset: 180 },
    { x: 150, y: 850, size: 150, delay: 2, floatOffset: 300 },
    { x: 60, y: 500, size: 130, delay: 1, floatOffset: 60 },
    { x: 500, y: 50, size: 120, delay: 3, floatOffset: 400 },
    { x: 580, y: 1000, size: 145, delay: 2, floatOffset: 350 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PRIMARY_600,
        overflow: 'hidden',
        opacity: entranceOpacity,
      }}
    >
      {/* Floating stars that form wheel */}
      {starsData.map((star, i) => (
        <FloatingStar
          key={i}
          {...star}
          convergeStart={convergeStart}
          index={i}
          totalStars={starsData.length}
        />
      ))}

      {/* Content */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '100px',
          opacity: contentFadeOut,
        }}
      >
        {/* Main headline */}
        <div
          style={{
            transform: `translateY(${headlineY}px)`,
            opacity: contentProgress,
            fontSize: '64px',
            fontFamily: "'Raleway', Arial, sans-serif",
            fontWeight: 600,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
            marginBottom: '40px',
          }}
        >
          Und: Jetzt mit 100% Anbietern aus Europa.
        </div>

        {/* Subtext */}
        <div
          style={{
            opacity: Math.max(0, subtextProgress),
            fontSize: '36px',
            fontFamily: "'Raleway', Arial, sans-serif",
            fontWeight: 400,
            color: SAND,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          So stärken wir echte europäische Unabhängigkeit.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene5Europe;
