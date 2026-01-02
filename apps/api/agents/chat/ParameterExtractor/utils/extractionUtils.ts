/**
 * Utility functions for parameter extraction
 * Common extraction helpers used across multiple extractors
 */

import type { ChatContext } from '../../types.js';
import type { AuthorExtractionResult, LinesExtractionResult } from '../types.js';

/**
 * Extract main theme from message
 */
export function extractTheme(message: string, context: ChatContext): string | null {
  // Check context first
  if (context.topic) {
    return context.topic;
  }

  // Common theme patterns
  const themePatterns = [
    /(?:zum thema|über|bezüglich|betreffend)\s+([^.!?]+)/i,
    /(?:thema:?\s*)([^.!?]+)/i,
    /(klimaschutz|umwelt|verkehr|energie|bildung|soziales|wirtschaft|digitalisierung|europa|demokratie)/i
  ];

  for (const pattern of themePatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Extract potential theme from first part of message
  const words = message.split(' ');
  if (words.length > 3) {
    return words.slice(0, 4).join(' ');
  }

  return null;
}

/**
 * Extract additional details from message
 */
export function extractDetails(message: string, theme: string | null): string | null {
  if (!theme) return message;

  // Remove theme from message to get details
  const themeIndex = message.toLowerCase().indexOf(theme.toLowerCase());
  if (themeIndex === -1) return message;

  const withoutTheme = message.substring(themeIndex + theme.length).trim();
  return withoutTheme.length > 0 ? withoutTheme : message;
}

/**
 * Extract target platforms from message
 */
export function extractPlatforms(message: string): string[] {
  const platforms: string[] = [];
  const lowerMessage = message.toLowerCase();

  const platformKeywords: Record<string, string[]> = {
    'twitter': ['twitter', 'tweet', 'x.com', 'x post'],
    'instagram': ['instagram', 'insta', 'ig'],
    'facebook': ['facebook', 'fb'],
    'linkedin': ['linkedin'],
    'tiktok': ['tiktok'],
    'mastodon': ['mastodon']
  };

  for (const [platform, keywords] of Object.entries(platformKeywords)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      platforms.push(platform);
    }
  }

  return platforms;
}

/**
 * Extract quote author from message
 */
export function extractQuoteAuthor(message: string): AuthorExtractionResult {
  const authorPatterns = [
    /(?:von|zitat von|quote from|autor:?)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)/i,
    /([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\s+(?:sagte|meinte|erklärte)/i,
    /author:\s*([^,\n]+)/i
  ];

  for (const pattern of authorPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Validate name (at least 2 characters, contains letters)
      if (name.length >= 2 && /[a-zäöüßA-ZÄÖÜ]/.test(name)) {
        return {
          value: name,
          confidence: 0.9,
          source: 'regex'
        };
      }
    }
  }

  return {
    value: null,
    confidence: 0,
    source: 'default'
  };
}

/**
 * Extract three lines for dreizeilen sharepic
 */
export function extractLines(message: string): LinesExtractionResult | null {
  // Pattern for explicit three lines
  const threeLinePattern = /zeile\s*1:?\s*["']?([^"'\n]+)["']?\s*zeile\s*2:?\s*["']?([^"'\n]+)["']?\s*zeile\s*3:?\s*["']?([^"'\n]+)["']?/i;
  const match = message.match(threeLinePattern);

  if (match && match[1] && match[2] && match[3]) {
    return {
      line1: match[1].trim(),
      line2: match[2].trim(),
      line3: match[3].trim()
    };
  }

  return null;
}

/**
 * Extract text form (e.g., Tweet, Pressemitteilung)
 */
export function extractTextForm(message: string): string | null {
  const textForms = [
    'tweet', 'facebook-post', 'instagram-post', 'linkedin-post',
    'pressemitteilung', 'antrag', 'rede', 'brief', 'artikel', 'blog', 'newsletter',
    'flyer', 'broschüre', 'wahlprogramm', 'stellungnahme', 'kommentar'
  ];

  const lowerMessage = message.toLowerCase();

  for (const form of textForms) {
    if (lowerMessage.includes(form)) {
      return form.charAt(0).toUpperCase() + form.slice(1);
    }
  }

  return null;
}

/**
 * Extract writing style from message
 */
export function extractStyle(message: string): string | null {
  const styles: Record<string, string[]> = {
    'sachlich': ['sachlich', 'neutral', 'objektiv'],
    'emotional': ['emotional', 'leidenschaftlich', 'bewegend'],
    'jugendlich': ['jugendlich', 'jung', 'hip', 'cool'],
    'formal': ['formal', 'offiziell', 'amtlich'],
    'persönlich': ['persönlich', 'individuell', 'direkt']
  };

  const lowerMessage = message.toLowerCase();

  for (const [style, keywords] of Object.entries(styles)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return style.charAt(0).toUpperCase() + style.slice(1);
    }
  }

  return null;
}

/**
 * Extract structure/outline information
 */
export function extractStructure(message: string): string | null {
  const structurePatterns = [
    /(?:gliederung|struktur|aufbau):?\s*([^.!?]+)/i,
    /(?:mit|in)\s+(\d+)\s+(?:punkten|teilen|abschnitten)/i
  ];

  for (const pattern of structurePatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Determine request type for Antrag
 */
export function determineRequestType(message: string): 'default' | 'kleine_anfrage' | 'grosse_anfrage' {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('kleine anfrage')) return 'kleine_anfrage';
  if (lowerMessage.includes('große anfrage') || lowerMessage.includes('grosse anfrage')) return 'grosse_anfrage';

  return 'default';
}
