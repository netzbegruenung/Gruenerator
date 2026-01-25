import { motion } from 'motion/react';

export interface AnimatedCheckmarkProps {
  size?: number;
}

const AnimatedCheckmark = ({ size = 50 }: AnimatedCheckmarkProps) => {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 52 52"
      initial="hidden"
      animate="visible"
      style={{ display: 'block' }}
    >
      <motion.path
        d="M14 27l7.75 7.75L38 17"
        fill="transparent"
        strokeWidth="5"
        stroke="var(--klee)"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: {
            pathLength: 1,
            opacity: 1,
            transition: {
              pathLength: { delay: 0.2, type: 'tween', duration: 0.3, ease: 'easeOut' },
              opacity: { delay: 0.2, duration: 0.01 },
            },
          },
        }}
      />
    </motion.svg>
  );
};

export default AnimatedCheckmark;
