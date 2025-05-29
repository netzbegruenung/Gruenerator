import React from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'motion/react';

const ConfirmDeletePopup = ({ isVisible, onConfirm, onCancel, title, message }) => {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="confirm-delete-overlay"
          onClick={handleOverlayClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div 
            className="confirm-delete-modal"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="confirm-delete-content">
              <div className="confirm-delete-icon">⚠️</div>
              <h3 className="confirm-delete-title">{title}</h3>
              <p className="confirm-delete-message">{message}</p>
            </div>
            
            <div className="confirm-delete-buttons">
              <button
                onClick={onCancel}
                className="confirm-delete-button confirm-delete-button-cancel"
              >
                Abbrechen
              </button>
              <button
                onClick={onConfirm}
                className="confirm-delete-button confirm-delete-button-confirm"
              >
                Löschen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

ConfirmDeletePopup.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  title: PropTypes.string,
  message: PropTypes.string
};

ConfirmDeletePopup.defaultProps = {
  title: 'Segment löschen?',
  message: 'Diese Aktion kann nicht rückgängig gemacht werden.'
};

export default ConfirmDeletePopup; 