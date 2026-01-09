import React from 'react';
import { motion } from 'motion/react';
import { HiPencil } from 'react-icons/hi';

interface FormToggleButtonFABProps {
  onClick: () => void;
}

export const FormToggleButtonFAB = React.memo<FormToggleButtonFABProps>(({ onClick }) => (
  <motion.button
    className="form-toggle-fab"
    onClick={onClick}
    initial={{ scale: 0, y: 50, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={{ scale: 0, y: 50, opacity: 0 }}
    whileHover={{ scale: 1.1, backgroundColor: 'var(--klee)' }}
    whileTap={{ scale: 0.95 }}
    transition={{ type: "spring", stiffness: 500, damping: 30 }}
    aria-label="Formular anzeigen"
  >
    <HiPencil size="24" />
  </motion.button>
));

FormToggleButtonFAB.displayName = 'FormToggleButtonFAB';
