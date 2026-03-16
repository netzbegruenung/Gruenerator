import { motion, AnimatePresence } from 'motion/react';
import React, { type ReactNode } from 'react';

import { cn } from '../../utils/cn';
import Icon from './Icon';

interface GenericModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  className?: string;
}

const sizeClasses = {
  small: 'w-[400px] max-sm:w-[95vw] max-sm:max-h-[80vh]',
  medium: 'w-[600px] max-sm:w-[95vw] max-sm:max-h-[80vh]',
  large: 'w-[900px] max-sm:w-[95vw] max-sm:max-h-[80vh]',
  fullscreen: 'w-screen h-screen !max-w-none !max-h-none !rounded-none',
};

const GenericModal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  className = '',
}: GenericModalProps) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className={cn(
          'fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] backdrop-blur-[4px]',
          className
        )}
        onClick={onClose}
      >
        <motion.div
          className={cn(
            'bg-background-pure rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.2)] flex flex-col max-h-[90vh] max-w-[90vw] overflow-hidden border border-grey-200 dark:border-grey-700',
            sizeClasses[size]
          )}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 flex items-center justify-between border-b border-grey-200 dark:border-grey-700">
            {title && <h2 className="m-0 text-xl text-foreground">{title}</h2>}
            <button
              className="bg-transparent border-none text-grey-500 cursor-pointer p-2 rounded-full flex items-center justify-center transition-colors duration-200 hover:bg-grey-100 hover:text-foreground dark:hover:bg-grey-800"
              onClick={onClose}
              aria-label="Schließen"
            >
              <Icon name="close" category="actions" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">{children}</div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GenericModal;
