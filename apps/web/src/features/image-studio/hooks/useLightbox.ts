import { useState, useCallback, useEffect } from 'react';

interface UseLightboxReturn {
  isOpen: boolean;
  openLightbox: () => void;
  closeLightbox: () => void;
}

export const useLightbox = (): UseLightboxReturn => {
  const [isOpen, setIsOpen] = useState(false);

  const openLightbox = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeLightbox();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeLightbox]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return {
    isOpen,
    openLightbox,
    closeLightbox,
  };
};

export default useLightbox;
