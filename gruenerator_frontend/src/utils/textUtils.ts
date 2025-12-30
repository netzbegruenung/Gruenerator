// Text utility functions

export const truncateWithSuffix = (text, maxLength, suffix = '') => {
  if (!text || typeof text !== 'string') return '';
  
  const effectiveMaxLength = maxLength - suffix.length;
  
  if (text.length <= effectiveMaxLength) {
    return text;
  }
  
  return text.substring(0, effectiveMaxLength - 3) + '...';
};

export const truncateMiddle = (text, maxLength) => {
  if (!text || typeof text !== 'string') return '';
  
  if (text.length <= maxLength) {
    return text;
  }
  
  const halfLength = Math.floor((maxLength - 3) / 2);
  return text.substring(0, halfLength) + '...' + text.substring(text.length - halfLength);
};