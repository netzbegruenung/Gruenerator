import React from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import { HiPencil } from 'react-icons/hi';

/**
 * Ein Floating Action Button (FAB), um das Formular ein- und auszublenden.
 * @param {Object} props - Komponenten-Props
 * @param {Function} props.onClick - Die Funktion, die beim Klick ausgeführt wird.
 */
const FormToggleButtonFAB = ({ onClick }) => {
  return (
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
  );
};

FormToggleButtonFAB.propTypes = {
  onClick: PropTypes.func.isRequired,
};

export default FormToggleButtonFAB; 