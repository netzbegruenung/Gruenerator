/**
 * Scanner Animations
 * Reusable animated components for the Zen Scanner experience
 * Uses motion/react for delightful micro-interactions
 */

import { motion, type Variants } from 'motion/react';

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

export const uploadZoneVariants: Variants = {
  idle: {},
  hover: {},
  dragOver: {},
};

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

interface AnimatedUploadIconProps {
  isDragOver: boolean;
  hasFile: boolean;
}

export const AnimatedUploadIcon = ({ isDragOver, hasFile }: AnimatedUploadIconProps) => {
  return (
    <motion.div
      className="scanner-upload-icon"
      animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <div className="scanner-upload-icon-circle">
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
      </div>
    </motion.div>
  );
};

interface AnimatedFileIconProps {
  isVisible: boolean;
}

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
