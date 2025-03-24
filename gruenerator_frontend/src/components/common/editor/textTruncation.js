/**
 * Kürzt einen Text auf die angegebene maximale Länge und fügt '...' in der Mitte ein.
 * Zeigt dabei immer Anfang und Ende des Textes an und schneidet an Wortgrenzen.
 * @param {string} text - Der zu kürzende Text
 * @param {number} maxLength - Maximale Länge des gekürzten Texts (Standard: 200)
 * @returns {string} Der gekürzte Text
 */
export const truncateMiddle = (text, maxLength = 200) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  // Größere Chunks für mehr Text
  const chunkSize = Math.floor((maxLength - 5) / 2);
  
  // Finde Wortgrenzen für Start und Ende
  const startText = text.slice(0, chunkSize);
  const endText = text.slice(-chunkSize);
  
  // Finde letzte Wortgrenze im Starttext
  const lastSpaceStart = startText.lastIndexOf(' ');
  const startChunk = lastSpaceStart > chunkSize/2 ? startText.slice(0, lastSpaceStart) : startText;
  
  // Finde erste Wortgrenze im Endtext
  const firstSpaceEnd = endText.indexOf(' ');
  const endChunk = firstSpaceEnd !== -1 ? endText.slice(firstSpaceEnd + 1) : endText;
  
  return `${startChunk.trim()} ... ${endChunk.trim()}`;
}; 