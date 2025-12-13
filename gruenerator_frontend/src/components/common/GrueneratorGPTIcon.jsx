import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';

const GrueneratorGPTIcon = ({ size, className = '', style = {} }) => {
  const [isHovered, setIsHovered] = useState(false);

  const centerX = 12;
  const centerY = 12;
  const radius = 9;

  const starPath = "M0,-2.5 L0.75,-0.75 L2.5,-0.75 L1.25,0.5 L1.75,2.5 L0,1.5 L-1.75,2.5 L-1.25,0.5 L-2.5,-0.75 L-0.75,-0.75 Z";

  const circlePositions = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 - 90) * (Math.PI / 180);
    circlePositions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }

  return (
    <motion.svg
      viewBox="0 0 24 24"
      width={size || '1em'}
      height={size || '1em'}
      fill="currentColor"
      className={`gruenerator-gpt-icon ${className}`.trim()}
      style={{
        display: 'inline-block',
        verticalAlign: '-0.125em',
        ...style
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Cog - fades out with slight spin on hover */}
      <motion.g
        animate={{
          opacity: isHovered ? 0 : 1,
          rotate: isHovered ? 45 : 0
        }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        style={{ transformOrigin: '12px 12px' }}
      >
        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <circle cx="12" cy="12" r="3" fill="var(--background-color, #fff)" />
      </motion.g>

      {/* Stars - fade in with slight spin on hover */}
      <motion.g
        animate={{
          opacity: isHovered ? 1 : 0,
          rotate: isHovered ? 0 : -30
        }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        style={{ transformOrigin: '12px 12px' }}
      >
        {circlePositions.map((pos, i) => (
          <path
            key={i}
            d={starPath}
            transform={`translate(${pos.x}, ${pos.y})`}
          />
        ))}
      </motion.g>
    </motion.svg>
  );
};

GrueneratorGPTIcon.propTypes = {
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
  style: PropTypes.object
};

export default GrueneratorGPTIcon;
