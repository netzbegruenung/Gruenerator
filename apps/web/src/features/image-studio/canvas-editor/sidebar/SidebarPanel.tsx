import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { SidebarPanelProps } from './types';
import { useMobileSheet } from '../hooks/useMobileSheet';

interface ExtendedSidebarPanelProps extends SidebarPanelProps {
  onClose?: () => void;
}

export function SidebarPanel({
  isOpen,
  children,
  onClose,
}: ExtendedSidebarPanelProps) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 900
  );


  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { handleRef, isDragging, translateY } = useMobileSheet({
    isOpen: isOpen && !isDesktop,
    onClose: onClose || (() => { }),
    threshold: 100,
    velocityThreshold: 0.5,
  });

  const handleBackdropClick = () => {
    if (!isDesktop && onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {!isDesktop && isOpen && (
        <motion.div
          className="sidebar-panel-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0 }}
          onClick={handleBackdropClick}
        />
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={`sidebar-panel ${isOpen ? 'sidebar-panel--open' : ''}`}
            initial={isDesktop ? { scaleX: 0, opacity: 0.8 } : { y: '100%' }}
            animate={isDesktop ? { scaleX: 1, opacity: 1 } : { y: 0 }}
            exit={isDesktop ? { scaleX: 0, opacity: 0.8 } : { y: '100%' }}
            transition={isDesktop ? { type: 'spring', damping: 28, stiffness: 350 } : { duration: 0 }}
            style={
              isDesktop
                ? { transformOrigin: 'left center' }
                : isDragging
                  ? { transform: `translateY(${translateY}px)`, transition: 'none' }
                  : undefined
            }
          >
            {/* Drag handle for mobile */}
            {!isDesktop && (
              <div ref={handleRef} className="sidebar-panel__drag-handle">
                <div className="sidebar-panel__drag-indicator" />
              </div>
            )}

            <div className="sidebar-panel__content">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
