/**
 * Text cleaning utilities for embedding preparation
 * - Removes markdown/HTML image references that add no semantic value
 * - Collapses excessive blank lines
 */

function removeMarkdownImages(text) {
  if (!text) return '';
  let out = text;
  // Remove markdown image syntax ![alt](url)
  out = out.replace(/!\[[^\]]*\]\([^\)]+\)/g, '');
  // Remove reference-style image lines: [id]: url.ext "title"
  out = out.replace(/^\s*\[[^\]]+\]:\s*\S+\.(png|jpe?g|gif|webp|svg)\b.*$/gim, '');
  // Remove HTML <img ...>
  out = out.replace(/<img\b[^>]*>/gi, '');
  // Remove bare image-only lines (e.g., img-0.jpeg markdown from OCR)
  out = out.replace(/^\s*!\[[^\]]*\]\([^\)]+\)\s*$/gim, '');
  return out;
}

function collapseBlankLines(text) {
  return (text || '').replace(/\n{3,}/g, '\n\n');
}

function cleanTextForEmbedding(text) {
  let out = text || '';
  // Remove soft hyphens
  out = out.replace(/\u00AD/g, '');
  // Dehyphenate across line breaks: join word-\nword into wordword
  out = out.replace(/([A-Za-zÄÖÜäöüß])\-\s*\n\s*([A-Za-zÄÖÜäöüß])/g, '$1$2');
  // Also handle common unicode letters (conservative, keep ASCII + German umlauts)
  out = removeMarkdownImages(out);
  out = collapseBlankLines(out);
  return out;
}

module.exports = {
  cleanTextForEmbedding,
  removeMarkdownImages,
  collapseBlankLines,
};
