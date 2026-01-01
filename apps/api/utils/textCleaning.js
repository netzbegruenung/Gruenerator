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

function cleanTextForEmbedding(text, preserveStructure = false) {
  let out = text || '';
  // Remove soft hyphens
  out = out.replace(/\u00AD/g, '');
  // Dehyphenate across line breaks: join word-\nword into wordword
  out = out.replace(/([A-Za-zÄÖÜäöüß])\-\s*\n\s*([A-Za-zÄÖÜäöüß])/g, '$1$2');
  // Join split words caused by OCR spacing inside a word: e.g., "No  vember" -> "November"
  out = out.replace(/([a-zäöüß])\s{2,}([a-zäöüß])/g, '$1$2');

  if (!preserveStructure) {
    // Collapse multiple spaces to single (but preserve page markers when preserveStructure=true)
    out = out.replace(/\s{2,}/g, ' ');
  } else {
    // Gentle space normalization that preserves page markers
    // Don't touch lines that look like page markers
    const lines = out.split('\n');
    out = lines.map(line => {
      if (/^##\s*Seite\s+\d+/i.test(line.trim())) {
        return line; // Preserve page markers exactly
      }
      // For other lines, still collapse excessive spaces but more carefully
      return line.replace(/[ \t]{3,}/g, ' ');
    }).join('\n');
  }

  // Also handle common unicode letters (conservative, keep ASCII + German umlauts)
  out = removeMarkdownImages(out);

  if (!preserveStructure) {
    out = collapseBlankLines(out);
  }
  return out;
}

export { cleanTextForEmbedding, removeMarkdownImages, collapseBlankLines };