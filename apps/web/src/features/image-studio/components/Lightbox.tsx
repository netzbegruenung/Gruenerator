import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { TemplateResultLightboxProps } from '../types/templateResultTypes';
import './Lightbox.css';

export const Lightbox: React.FC<TemplateResultLightboxProps> = ({
  isOpen,
  onClose,
  imageSrc,
  altText
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="image-lightbox-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="image-lightbox-content">
          <button
            className="image-lightbox-close"
            onClick={onClose}
            aria-label="Lightbox schließen"
          >
            ×
          </button>
          <img
            src={imageSrc}
            alt={altText || 'Vergrößertes Bild'}
            className="image-lightbox-image"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Lightbox;
