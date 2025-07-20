import { useEffect, useRef } from 'react';

/**
 * Hook to handle clicks outside of a referenced element
 * @param {Function} callback - Function to call when clicking outside
 * @param {boolean} isActive - Whether the hook should be active (default: true)
 * @returns {Object} ref - Ref to attach to the element you want to detect outside clicks for
 */
const useClickOutside = (callback, isActive = true) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    };

    const handleEscapeKey = (event) => {
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