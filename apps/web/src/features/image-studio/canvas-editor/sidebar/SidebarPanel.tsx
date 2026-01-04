import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { SidebarPanelProps } from './types';

export function SidebarPanel({
  isOpen,
  children,
}: SidebarPanelProps) {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="sidebar-panel"
          initial={isDesktop ? { scaleX: 0, opacity: 0.8 } : { y: '100%' }}
          animate={isDesktop ? { scaleX: 1, opacity: 1 } : { y: 0 }}
          exit={isDesktop ? { scaleX: 0, opacity: 0.8 } : { y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          style={isDesktop ? { transformOrigin: 'left center' } : undefined}
        >
          <div className="sidebar-panel__content">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
