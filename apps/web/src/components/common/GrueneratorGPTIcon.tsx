import { useState, type CSSProperties } from 'react';

export interface GrueneratorGPTIconProps {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

// Plain CSS transitions instead of motion/react: this icon sits in the shell
// icon registry (config/icons.ts), so a motion import here put the whole
// motion runtime (~130 KB minified) into the entry's static closure (#5891).
const TRANSITION = 'opacity 0.35s ease-in-out, transform 0.35s ease-in-out';

const groupStyle = (opacity: number, rotate: number): CSSProperties => ({
  opacity,
  transform: `rotate(${rotate}deg)`,
  transformOrigin: '12px 12px',
  transition: TRANSITION,
});

const GrueneratorGPTIcon = ({ size, className = '', style = {} }: GrueneratorGPTIconProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const centerX = 12;
  const centerY = 12;
  const radius = 9;

  const starPath =
    'M0,-2.5 L0.75,-0.75 L2.5,-0.75 L1.25,0.5 L1.75,2.5 L0,1.5 L-1.75,2.5 L-1.25,0.5 L-2.5,-0.75 L-0.75,-0.75 Z';

  const circlePositions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 - 90) * (Math.PI / 180);
    circlePositions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size || '1em'}
      height={size || '1em'}
      fill="currentColor"
      className={`gruenerator-gpt-icon ${className}`.trim()}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.125em',
        ...style,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <g style={groupStyle(isHovered ? 0 : 1, isHovered ? 45 : 0)}>
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <circle cx="12" cy="12" r="3" fill="var(--background-color, #fff)" />
      </g>

      <g style={groupStyle(isHovered ? 1 : 0, isHovered ? 0 : -30)}>
        {circlePositions.map((pos, i) => (
          <path key={i} d={starPath} transform={`translate(${pos.x}, ${pos.y})`} />
        ))}
      </g>
    </svg>
  );
};

export default GrueneratorGPTIcon;
