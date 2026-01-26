import React from 'react';
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

const EU_GOLD = '#FFCC00';
const EU_BLUE = '#003399';
const DARK_GREEN = '#005437';

// Logo circle center position (between "Gruenera" and "tor")
const LOGO_CENTER_X = 642;
const LOGO_CENTER_Y = 540;
const CIRCLE_RADIUS = 26;
const FINAL_STAR_SIZE = 24;

// 8 stars - same positions as Scene 5
const starsData = [
  { x: 80, y: 120, size: 160 },
  { x: 950, y: 80, size: 180 },
  { x: 1020, y: 450, size: 140 },
  { x: 920, y: 950, size: 170 },
  { x: 150, y: 850, size: 150 },
  { x: 60, y: 500, size: 130 },
  { x: 500, y: 50, size: 120 },
  { x: 580, y: 1000, size: 145 },
];

// Each star flies to its exact position in the circle
const FlyingStar = ({ startX, startY, startSize, index, totalStars }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate this star's final position in the circle
  const angle = (index / totalStars) * Math.PI * 2 - Math.PI / 2;
  const targetX = LOGO_CENTER_X + Math.cos(angle) * CIRCLE_RADIUS;
  const targetY = LOGO_CENTER_Y + Math.sin(angle) * CIRCLE_RADIUS;

  // Smooth flight animation
  const progress = spring({
    frame: frame,
    fps,
    config: {
      damping: 20,
      stiffness: 200,
    },
  });

  // Fly from original position to circle position
  const x = interpolate(progress, [0, 1], [startX, targetX], {
    extrapolateRight: 'clamp',
  });
  const y = interpolate(progress, [0, 1], [startY, targetY], {
    extrapolateRight: 'clamp',
  });

  // Shrink from big floating star to small circle star
  const size = interpolate(progress, [0, 1], [startSize * 0.7, FINAL_STAR_SIZE], {
    extrapolateRight: 'clamp',
  });

  // Spin a little as they fly (60 degrees)
  const rotation = progress * 60;

  // Transition color from EU_GOLD to DARK_GREEN as stars fly
  const starColor = progress > 0.5 ? DARK_GREEN : EU_GOLD;
  const glowColor = progress > 0.5 ? 'rgba(0, 84, 55, 0.5)' : 'rgba(255, 204, 0, 0.8)';

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        fontSize: size,
        color: starColor,
        textShadow: `0 0 15px ${glowColor}`,
        zIndex: 10,
      }}
    >
      ★
    </div>
  );
};

const Scene6Logo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background transition from EU blue to white
  const bgProgress = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Logo appears almost instantly as stars collapse
  const appearDelay = 3;
  const appearProgress = spring({
    frame: frame - appearDelay,
    fps,
    config: {
      damping: 20,
      stiffness: 300,
    },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: `rgb(${interpolate(bgProgress, [0, 1], [0, 255])}, ${interpolate(bgProgress, [0, 1], [51, 255])}, ${interpolate(bgProgress, [0, 1], [153, 255])})`,
        overflow: 'hidden',
      }}
    >
      {/* Stars fly from their positions to form the circle "o" */}
      {starsData.map((star, i) => (
        <FlyingStar
          key={i}
          startX={star.x}
          startY={star.y}
          startSize={star.size}
          index={i}
          totalStars={starsData.length}
        />
      ))}

      {/* Logo and text container */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Gruenerator - the flying stars form the "o" */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '90px',
            fontFamily: "'GrueneTypeNeue', 'GrueneType Neue', Arial, sans-serif",
            color: DARK_GREEN,
            letterSpacing: '-2px',
            opacity: appearProgress,
          }}
        >
          {/* "Gruenera" */}
          <span>Gruenera</span>

          {/* Space for the star circle - stars fly here */}
          <div style={{ width: '70px', height: '70px' }} />

          {/* "tor" */}
          <span style={{ marginLeft: '18px' }}>tor</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default Scene6Logo;
