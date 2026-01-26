/**
 * Extract a meaningful title from HTML content
 * Follows priority: h2 → h1 → h3 → first sentence → first line → fallback
 */

/**
 * Strip HTML tags from a string
 */
function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Extract title from HTML content
 * @param content - HTML content string
 * @param maxLength - Maximum title length (default: 200)
 * @returns Extracted title string
 */
export function extractTitleFromContent(content: string, maxLength: number = 200): string {
  if (!content || content.trim().length === 0) {
    return generateFallbackTitle();
  }

  const tmp = document.createElement('div');
  tmp.innerHTML = content;

  // Priority 1: h2
  const h2 = tmp.querySelector('h2');
  if (h2 && h2.textContent) {
    return truncate(h2.textContent.trim(), maxLength);
  }

  // Priority 2: h1
  const h1 = tmp.querySelector('h1');
  if (h1 && h1.textContent) {
    return truncate(h1.textContent.trim(), maxLength);
  }

  // Priority 3: h3
  const h3 = tmp.querySelector('h3');
  if (h3 && h3.textContent) {
    return truncate(h3.textContent.trim(), maxLength);
  }

  // Priority 4: Platform detection (for social media posts)
  const platformTitle = detectPlatformTitle(content);
  if (platformTitle) {
    return truncate(platformTitle, maxLength);
  }

  // Priority 5: First sentence (ending with ., !, ?)
  const plainText = stripHtml(content);
  const firstSentence = plainText.match(/^[^.!?]+[.!?]/);
  if (firstSentence) {
    return truncate(firstSentence[0].trim(), maxLength);
  }

  // Priority 6: First line
  const firstLine = plainText.split('\n')[0];
  if (firstLine && firstLine.trim().length > 0) {
    return truncate(firstLine.trim(), maxLength);
  }

  // Fallback
  return generateFallbackTitle();
}

/**
 * Detect platform-specific title patterns
 */
function detectPlatformTitle(content: string): string | null {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('twitter') || lowerContent.includes('tweet')) {
    return 'Twitter-Post';
  }
  if (lowerContent.includes('facebook')) {
    return 'Facebook-Beitrag';
  }
  if (lowerContent.includes('instagram')) {
    return 'Instagram-Post';
  }
  if (lowerContent.includes('linkedin')) {
    return 'LinkedIn-Beitrag';
  }
  if (lowerContent.includes('tiktok')) {
    return 'TikTok-Video';
  }

  // Document type patterns
  if (lowerContent.match(/antrag|anfrage/)) {
    return 'Antrag';
  }
  if (lowerContent.match(/pressemitteilung|presseerklärung/)) {
    return 'Pressemitteilung';
  }
  if (lowerContent.match(/rede|ansprache/)) {
    return 'Rede';
  }
  if (lowerContent.match(/wahlprogramm/)) {
    return 'Wahlprogramm';
  }

  return null;
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Generate fallback title with timestamp
 */
function generateFallbackTitle(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `Gespeicherter Text vom ${dateStr}`;
}
