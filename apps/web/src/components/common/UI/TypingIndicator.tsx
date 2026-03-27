import { motion, type Variants } from 'motion/react';

const TypingIndicator = () => {
  const createDotVariants = (delay: number): Variants => ({
    initial: {
      y: '0%',
      opacity: 0.5,
    },
    animate: {
      y: ['0%', '-30%', '0%'],
      opacity: [0.5, 1, 0.5],
      transition: {
        duration: 0.7,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      },
    },
  });

  return (
    <div className="flex items-center py-2.5">
      <motion.span
        variants={createDotVariants(0)}
        initial="initial"
        animate="animate"
        className="w-2 h-2 bg-[var(--ai-message-text-color)] rounded-full inline-block mx-0.5"
      />
      <motion.span
        variants={createDotVariants(0.2)}
        initial="initial"
        animate="animate"
        className="w-2 h-2 bg-[var(--ai-message-text-color)] rounded-full inline-block mx-0.5"
      />
      <motion.span
        variants={createDotVariants(0.4)}
        initial="initial"
        animate="animate"
        className="w-2 h-2 bg-[var(--ai-message-text-color)] rounded-full inline-block mx-0.5"
      />
    </div>
  );
};

export default TypingIndicator;
