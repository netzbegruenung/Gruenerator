import { useEffect, useRef } from 'react';

const useClickOutside = <T extends HTMLElement = HTMLElement>(callback: () => void, isActive = true) => {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        callback();
      }
    };

    // Add event listeners
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [callback, isActive]);

  return ref;
};

export default useClickOutside;