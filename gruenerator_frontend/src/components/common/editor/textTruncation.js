/**
 * Truncates text in the middle, keeping start and end visible
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length of the result
 * @returns {string} Truncated text with ellipsis in the middle
 */
export const truncateMiddle = (text, maxLength) => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  if (text.length <= maxLength) {
    return text;
  }
  
  const ellipsis = '...';
  const availableLength = maxLength - ellipsis.length;
  const startLength = Math.ceil(availableLength / 2);
  const endLength = Math.floor(availableLength / 2);
  
  return text.slice(0, startLength) + ellipsis + text.slice(-endLength);
}; 