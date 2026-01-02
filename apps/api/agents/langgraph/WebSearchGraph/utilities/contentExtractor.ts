/**
 * Content extraction utilities for WebSearchGraph
 * Extracts relevant paragraphs from crawled content
 */

/**
 * Extract key paragraphs from content based on query relevance
 */
export function extractKeyParagraphs(content: string, query: string, maxLength: number = 400): string {
  if (!content || content.length <= maxLength) {
    return content || '';
  }

  // Split content into paragraphs
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);

  // Simple relevance scoring based on query terms
  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);

  const scoredParagraphs = paragraphs.map(paragraph => {
    const lowerPara = paragraph.toLowerCase();
    const score = queryTerms.reduce((score, term) => {
      return score + (lowerPara.split(term).length - 1);
    }, 0);

    return { paragraph: paragraph.trim(), score };
  });

  // Sort by relevance and take top paragraphs that fit within maxLength
  scoredParagraphs.sort((a, b) => b.score - a.score);

  let result = '';
  for (const { paragraph } of scoredParagraphs) {
    if (result.length + paragraph.length + 3 <= maxLength) { // +3 for spacing
      result += (result ? '\n\n' : '') + paragraph;
    } else if (result.length === 0) {
      // If even the first paragraph is too long, truncate it
      result = paragraph.slice(0, maxLength - 3) + '...';
      break;
    } else {
      break;
    }
  }

  return result || content.slice(0, maxLength - 3) + '...';
}
