/**
 * Scanner Animations
 * Reusable animated components for the Zen Scanner experience
 * Uses motion/react for delightful micro-interactions
 */

import { motion, type Variants } from 'motion/react';
import { useEffect, useState, useRef } from 'react';

// Animation variants for the results panel (slide up with spring physics)
export const resultsVariants: Variants = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300 },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.98,
    transition: { duration: 0.2 },
  },
};

// Upload zone variants
export const uploadZoneVariants: Variants = {
  idle: { scale: 1 },
  hover: { scale: 1.01, transition: { type: 'spring', stiffness: 400, damping: 25 } },
  dragOver: { scale: 1.02, transition: { type: 'spring', stiffness: 400, damping: 25 } },
};

// File icon bounce animation when file drops
export const fileIconVariants: Variants = {
  hidden: { scale: 0, opacity: 0, rotate: -10 },
  visible: {
    scale: 1,
    opacity: 1,
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 15,
    },
  },
};

// Success pulse animation for the card
export const successPulseVariants: Variants = {
  idle: { boxShadow: '0 0 0 0 rgba(95, 133, 117, 0)' },
  pulse: {
    boxShadow: [
      '0 0 0 0 rgba(95, 133, 117, 0)',
      '0 0 30px 10px rgba(95, 133, 117, 0.3)',
      '0 0 0 0 rgba(95, 133, 117, 0)',
    ],
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

interface ScanLineProps {
  isActive: boolean;
}

/**
 * Animated scan line that sweeps across during processing
 */
export const ScanLine = ({ isActive }: ScanLineProps) => {
  if (!isActive) return null;

  return (
    <motion.div
      className="scanner-scan-line"
      initial={{ y: '0%', opacity: 0 }}
      animate={{
        y: ['0%', '100%', '0%'],
        opacity: [0.6, 0.8, 0.6],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
};

interface TypewriterTextProps {
  text: string;
  isActive: boolean;
  speed?: number;
}

/**
 * Typewriter effect for processing status text
 */
export const TypewriterText = ({ text, isActive, speed = 50 }: TypewriterTextProps) => {
  const [displayText, setDisplayText] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!isActive) {
      setDisplayText(text);
      return;
    }

    setDisplayText('');
    indexRef.current = 0;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayText(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, isActive, speed]);

  return (
    <span className="scanner-typewriter">
      {displayText}
      {isActive && indexRef.current < text.length && (
        <motion.span
          className="scanner-cursor"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          |
        </motion.span>
      )}
    </span>
  );
};

interface ParticleSparkleProps {
  isActive: boolean;
}

/**
 * Particle sparkle burst effect on success
 */
export const ParticleSparkle = ({ isActive }: ParticleSparkleProps) => {
  if (!isActive) return null;

  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const distance = 60;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  });

  return (
    <div className="scanner-particles">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="scanner-particle"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: particle.x,
            y: particle.y,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 0.6,
            ease: 'easeOut',
            delay: particle.id * 0.02,
          }}
        />
      ))}
    </div>
  );
};

interface AnimatedUploadIconProps {
  isDragOver: boolean;
  hasFile: boolean;
}

/**
 * Upload icon with animated states
 */
export const AnimatedUploadIcon = ({ isDragOver, hasFile }: AnimatedUploadIconProps) => {
  return (
    <motion.div
      className="scanner-upload-icon"
      animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <motion.svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={isDragOver ? { y: [0, -3, 0] } : {}}
        transition={isDragOver ? { duration: 0.6, repeat: Infinity } : {}}
      >
        <motion.path
          d="M24 32V16M24 16L18 22M24 16L30 22"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 1 }}
          animate={isDragOver ? { pathLength: [1, 0.8, 1] } : { pathLength: 1 }}
          transition={isDragOver ? { duration: 1.2, repeat: Infinity } : {}}
        />
        <motion.path
          d="M8 32C8 36.4183 11.5817 40 16 40H32C36.4183 40 40 36.4183 40 32V28"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.div>
  );
};

interface AnimatedFileIconProps {
  isVisible: boolean;
}

/**
 * File icon with bounce entrance animation
 */
export const AnimatedFileIcon = ({ isVisible }: AnimatedFileIconProps) => {
  return (
    <motion.div
      className="scanner-file-icon"
      variants={fileIconVariants}
      initial="hidden"
      animate={isVisible ? 'visible' : 'hidden'}
    >
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M28 8H14C12.9 8 12 8.9 12 10V38C12 39.1 12.9 40 14 40H34C35.1 40 36 39.1 36 38V16L28 8Z"
          fill="currentColor"
          fillOpacity="0.1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M28 8V16H36"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 24H30M18 30H30M18 36H26"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
};

/**
 * Processing spinner with scan animation
 */
export const ProcessingSpinner = () => {
  return (
    <motion.div
      className="scanner-processing-spinner"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
    >
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
        <motion.path
          d="M24 4C35.046 4 44 12.954 44 24"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </motion.div>
  );
};

/**
 * Marching ants border animation (SVG-based for precise control)
 */
interface MarchingAntsBorderProps {
  isActive: boolean;
  width: number;
  height: number;
  radius: number;
}

export const MarchingAntsBorder = ({
  isActive,
  width,
  height,
  radius,
}: MarchingAntsBorderProps) => {
  if (!isActive) return null;

  return (
    <svg
      className="scanner-marching-ants"
      width="100%"
      height="100%"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    >
      <motion.rect
        x="2"
        y="2"
        width="calc(100% - 4px)"
        height="calc(100% - 4px)"
        rx={radius}
        ry={radius}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeDasharray="8 4"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -12 }}
        transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
      />
    </svg>
  );
};
