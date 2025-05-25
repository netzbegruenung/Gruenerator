import React from 'react';
import { motion } from 'motion/react';

const CollabEditorSkeleton = () => {
  const pulseAnimation = {
    scale: [1, 1.005, 1], // Subtle scale for less distraction
    opacity: [0.6, 0.8, 0.6], // Adjusted opacity
    transition: {
      duration: 1.8, // Slightly longer duration
      ease: "easeInOut",
      repeat: Infinity,
    },
  };

  return (
    <div className="collab-editor-content"> {/* Matches the structure of the actual content wrapper */}
      <div className="collab-editor-main-content"> {/* Matches the inner structure */}
        <motion.div className="skeleton-chat-column" animate={pulseAnimation} />
        <motion.div className="skeleton-quill-column" animate={pulseAnimation}>
          <motion.div className="skeleton-line" style={{ width: '90%', marginTop: 'var(--spacing-medium)' }} animate={pulseAnimation} />
          <motion.div className="skeleton-line" style={{ width: '80%' }} animate={pulseAnimation} />
          <motion.div className="skeleton-line" style={{ width: '95%' }} animate={pulseAnimation} />
          <motion.div className="skeleton-line" style={{ width: '70%' }} animate={pulseAnimation} />
          <motion.div className="skeleton-line" style={{ width: '85%' }} animate={pulseAnimation} />
          <motion.div className="skeleton-line" style={{ width: '60%', marginBottom: 'var(--spacing-medium)' }} animate={pulseAnimation} />
        </motion.div>
      </div>
    </div>
  );
};

export default CollabEditorSkeleton; 