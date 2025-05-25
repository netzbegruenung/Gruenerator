import React from 'react';
import { motion } from 'motion/react';

const AnimatedCheckmark = () => {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width="50" // Größe kann bei Bedarf als Prop übergeben werden
      height="50" // Größe kann bei Bedarf als Prop übergeben werden
      viewBox="0 0 52 52" // Angepasst für den Pfad
      initial="hidden"
      animate="visible"
      style={{ display: 'block' }} // Stellt sicher, dass es sich im Flex-Layout gut verhält
    >
      <motion.path
        d="M14 27l7.75 7.75L38 17" // Standard-SVG-Pfad für einen Haken
        fill="transparent"
        strokeWidth="5" // Strichstärke
        stroke="var(--klee)" // Verwendung einer Theme-Farbe (Erfolg)
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