import { motion, Variants } from 'motion/react';
import '../../../assets/styles/components/ui/TypingIndicator.css';

const TypingIndicator = () => {
  const createDotVariants = (delay: number): Variants => ({
    initial: {
      y: "0%",
      opacity: 0.5,
    },
    animate: {
      y: ["0%", "-30%", "0%"],
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 0.7,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      },
    },
  });

  return (
    <div className="typing-indicator">
      <motion.span
        variants={createDotVariants(0)}
        initial="initial"
        animate="animate"
        className="typing-dot"
      />
      <motion.span
        variants={createDotVariants(0.2)}
        initial="initial"
        animate="animate"
        className="typing-dot"
      />
      <motion.span
        variants={createDotVariants(0.4)}
        initial="initial"
        animate="animate"
        className="typing-dot"
      />
    </div>
  );
};

export default TypingIndicator;
