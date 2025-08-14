import React from 'react';
import { motion } from 'motion/react';
import { HiChip } from "react-icons/hi";
import '../../../assets/styles/components/ui/TypingIndicator.css';

const TypingIndicator = () => {
  const dotVariants = {
    initial: {
      y: "0%",
      opacity: 0.5,
    },
    animate: {
      y: ["0%", "-30%", "0%"],
      opacity: [0.5, 1, 0.5],
    },
  };

  const transition = (delay) => ({
    duration: 0.7,
    repeat: Infinity,
    ease: "easeInOut",
    delay,
  });

  return (
    <div className="chat-message assistant typing-indicator">
      <HiChip className="assistant-icon" />
      <motion.span
        variants={dotVariants}
        initial="initial"
        animate="animate"
        transition={transition(0)}
        className="typing-dot"
      />
      <motion.span
        variants={dotVariants}
        initial="initial"
        animate="animate"
        transition={transition(0.2)}
        className="typing-dot"
      />
      <motion.span
        variants={dotVariants}
        initial="initial"
        animate="animate"
        transition={transition(0.4)}
        className="typing-dot"
      />
    </div>
  );
};

export default TypingIndicator; 