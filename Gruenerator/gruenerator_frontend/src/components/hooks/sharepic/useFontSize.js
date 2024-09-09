import { useState, useCallback, useMemo } from 'react';
import { FONT_SIZES, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../../utils/constants';

export const useFontSize = (initialSize = 'm') => {
  const [fontSize, setFontSize] = useState(initialSize);

  const handleFontSizeChange = useCallback((event) => {
    setFontSize(event.target.value);
  }, []);

  const getFontSizeInPixels = useMemo(() => {
    const size = FONT_SIZES[fontSize] || FONT_SIZES.m;
    return Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE);
  }, [fontSize]);

  return {
    fontSize,
    handleFontSizeChange,
    getFontSizeInPixels,
    FONT_SIZES
  };
};