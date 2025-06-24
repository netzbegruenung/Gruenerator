/**
 * Process text containing citation markers and prepare data for rendering
 * @param {string} text - Text containing citation markers (⚡CITE1⚡, ⚡CITE2⚡, etc.)
 * @param {Array} citations - Array of citation objects
 * @returns {Array} Array of objects with type and data for rendering
 */
export const processCitationText = (text, citations = []) => {
  if (!text || typeof text !== 'string') return [{ type: 'text', content: text }];
  
  // Pattern to match citation markers: ⚡CITE1⚡, ⚡CITE2⚡, etc.
  const citationMarkerPattern = /⚡CITE(\d+)⚡/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  // Create a lookup map for citations by index
  const citationMap = new Map();
  citations.forEach(citation => {
    citationMap.set(citation.index.toString(), citation);
  });
  
  while ((match = citationMarkerPattern.exec(text)) !== null) {
    const [fullMatch, citationIndex] = match;
    const matchStart = match.index;
    
    // Add text before this citation
    if (matchStart > lastIndex) {
      const textBefore = text.slice(lastIndex, matchStart);
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }
    
    // Find the corresponding citation
    const citation = citationMap.get(citationIndex);
    
    // Add the citation data
    parts.push({
      type: 'citation',
      citationIndex: citationIndex,
      citation: citation,
      key: `citation-${citationIndex}-${matchStart}`
    });
    
    lastIndex = match.index + fullMatch.length;
  }
  
  // Add remaining text after last citation
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      parts.push({ type: 'text', content: remainingText });
    }
  }
  
  // If no citations were found, return the original text
  return parts.length === 0 ? [{ type: 'text', content: text }] : parts;
};

/**
 * Convert citation markers back to simple bracketed numbers for display
 * @param {string} text - Text containing citation markers
 * @returns {string} Text with [1], [2] format citations
 */
export const convertCitationMarkersToNumbers = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // Replace ⚡CITE1⚡ with [1], ⚡CITE2⚡ with [2], etc.
  return text.replace(/⚡CITE(\d+)⚡/g, '[$1]');
};

/**
 * Extract citation indices from text containing citation markers
 * @param {string} text - Text containing citation markers
 * @returns {Array} Array of citation indices as strings
 */
export const extractCitationIndices = (text) => {
  if (!text || typeof text !== 'string') return [];
  
  const citationMarkerPattern = /⚡CITE(\d+)⚡/g;
  const indices = [];
  let match;
  
  while ((match = citationMarkerPattern.exec(text)) !== null) {
    indices.push(match[1]);
  }
  
  return [...new Set(indices)]; // Remove duplicates
};

/**
 * Check if text contains citation markers
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains citation markers
 */
export const hasCitationMarkers = (text) => {
  if (!text || typeof text !== 'string') return false;
  return /⚡CITE\d+⚡/.test(text);
};