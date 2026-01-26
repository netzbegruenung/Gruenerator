import { useState, useCallback, useEffect } from 'react';

interface UseEditPanelReturn {
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  isAlternativesOpen: boolean;
  setIsAlternativesOpen: (open: boolean) => void;
  isAdvancedOpen: boolean;
  toggleAdvanced: () => void;
}

export const useEditPanel = (): UseEditPanelReturn => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAlternativesOpen, setIsAlternativesOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const openPanel = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleAdvanced = useCallback(() => {
    setIsAdvancedOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closePanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePanel]);

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
    openPanel,
    closePanel,
    isAlternativesOpen,
    setIsAlternativesOpen,
    isAdvancedOpen,
    toggleAdvanced,
  };
};

export default useEditPanel;
