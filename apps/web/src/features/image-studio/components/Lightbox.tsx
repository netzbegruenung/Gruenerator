import { motion, AnimatePresence } from 'motion/react';
import React from 'react';

import type { TemplateResultLightboxProps } from '../types/templateResultTypes';

export const Lightbox: React.FC<TemplateResultLightboxProps> = ({
  isOpen,
  onClose,
  imageSrc,
  altText,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/90 flex items-center justify-center z-[300] cursor-zoom-out"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <div className="relative max-w-[95vw] max-h-[95vh]">
          <button
            className="absolute -top-10 right-0 bg-transparent border-none text-white text-[32px] cursor-pointer p-sm leading-none"
            onClick={onClose}
            aria-label="Lightbox schließen"
          >
            ×
          </button>
          <img
            src={imageSrc}
            alt={altText || 'Vergrößertes Bild'}
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-md"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default Lightbox;
