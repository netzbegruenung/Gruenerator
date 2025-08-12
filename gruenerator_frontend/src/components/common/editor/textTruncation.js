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

/**
 * Truncates text at the end with ellipsis
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length of the result
 * @returns {string} Truncated text with ellipsis at the end
 */
export const truncateEnd = (text, maxLength) => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  if (text.length <= maxLength) {
    return text;
  }
  
  const ellipsis = '...';
  if (maxLength <= ellipsis.length) {
    return ellipsis.slice(0, maxLength);
  }
  
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
};

/**
 * Truncates a filename while preserving the extension
 * @param {string} fileName - The filename to truncate
 * @param {number} maxLength - Maximum length of the result
 * @returns {string} Truncated filename with extension preserved
 */
export const truncateFileName = (fileName, maxLength) => {
  if (!fileName || typeof fileName !== 'string') {
    return '';
  }
  
  if (fileName.length <= maxLength) {
    return fileName;
  }
  
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension, use standard end truncation
    return truncateEnd(fileName, maxLength);
  }
  
  const extension = fileName.substring(lastDotIndex);
  const nameWithoutExtension = fileName.substring(0, lastDotIndex);
  const ellipsis = '...';
  const availableLength = maxLength - extension.length - ellipsis.length;
  
  if (availableLength <= 0) {
    // Extension is too long, just show end of filename
    return ellipsis + fileName.slice(-(maxLength - ellipsis.length));
  }
  
  return nameWithoutExtension.substring(0, availableLength) + ellipsis + extension;
};

/**
 * Truncates text while reserving space for a known suffix
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length of the final result (text + suffix)
 * @param {string} suffix - The suffix that will be appended after truncation
 * @returns {string} Truncated text (without suffix) that leaves room for the suffix
 */
export const truncateWithSuffix = (text, maxLength, suffix = '') => {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const suffixLength = suffix.length;
  const effectiveMaxLength = maxLength - suffixLength;
  
  if (effectiveMaxLength <= 0) {
    return '';
  }
  
  if (text.length <= effectiveMaxLength) {
    return text;
  }
  
  // For filenames, preserve extension if possible
  if (text.includes('.') && !suffix.includes('.')) {
    return truncateFileName(text, effectiveMaxLength);
  }
  
  // Standard end truncation
  return truncateEnd(text, effectiveMaxLength);
}; 