import { motion } from 'motion/react';
import React from 'react';
import { HiPencil } from 'react-icons/hi';

interface FormToggleButtonFABProps {
  onClick: () => void;
}

export const FormToggleButtonFAB = React.memo<FormToggleButtonFABProps>(({ onClick }) => (
  <motion.button
    className="fixed bottom-lg left-lg w-14 h-14 rounded-full bg-secondary-500 text-white border-none flex items-center justify-center shadow-lg cursor-pointer z-[1000] transition-colors duration-250 focus:outline-2 focus:outline-accent focus:outline-offset-2"
    onClick={onClick}
    initial={{ scale: 0, y: 50, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={{ scale: 0, y: 50, opacity: 0 }}
    whileHover={{ scale: 1.1, backgroundColor: 'var(--klee)' }}
    whileTap={{ scale: 0.95 }}
    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    aria-label="Formular anzeigen"
  >
    <HiPencil size="24" />
  </motion.button>
));

FormToggleButtonFAB.displayName = 'FormToggleButtonFAB';
