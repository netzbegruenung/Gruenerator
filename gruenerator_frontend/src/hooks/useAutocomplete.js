import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { findMatches, PLATFORM_ALIASES } from '../utils/autocompleteUtils';

/**
 * useAutocomplete - Reusable hook for autocomplete functionality
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.options - Array of { value, label } objects to match against
 * @param {Object} options.aliases - Alias map (defaults to PLATFORM_ALIASES)
 * @param {number} options.minChars - Minimum characters before matching (default: 2)
 * @param {number} options.debounceMs - Debounce delay in ms (default: 150)
 * @param {number} options.threshold - Match score threshold 0-1 (default: 0.5)
 *
 * @returns {Object} Autocomplete state and methods
 */
export const useAutocomplete = ({
  options = [],
  aliases = PLATFORM_ALIASES,
  minChars = 2,
  debounceMs = 150,
  threshold = 0.5
} = {}) => {
  const [inputValue, setInputValue] = useState('');
  const [debouncedValue, setDebouncedValue] = useState('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(inputValue);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [inputValue, debounceMs]);

  const result = useMemo(() => {
    return findMatches(debouncedValue, options, {
      aliases,
      minChars,
      threshold
    });
  }, [debouncedValue, options, aliases, minChars, threshold]);

  const reset = useCallback(() => {
    setInputValue('');
    setDebouncedValue('');
  }, []);

  const handleInputChange = useCallback((value) => {
    setInputValue(value || '');
  }, []);

  return {
    ...result,
    inputValue,
    setInputValue: handleInputChange,
    reset
  };
};

export default useAutocomplete;
