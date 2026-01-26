/**
 * Imagine (FLUX) specific utility functions
 * Handles mode detection, variant extraction, and subject parsing
 */

import type { ChatContext } from '../../types.js';
import type { VariantResult, ImagineVariantKeywords } from '../types.js';

/**
 * Variant keyword mapping for imagine agent
 */
export const IMAGINE_VARIANT_KEYWORDS: ImagineVariantKeywords = {
  illustration: 'illustration-pure',
  zeichnung: 'illustration-pure',
  aquarell: 'illustration-pure',
  malerisch: 'illustration-pure',
  realistisch: 'realistic-pure',
  foto: 'realistic-pure',
  fotorealistisch: 'realistic-pure',
  photorealistisch: 'realistic-pure',
  pixel: 'pixel-pure',
  retro: 'pixel-pure',
  pixelart: 'pixel-pure',
  '16-bit': 'pixel-pure',
  editorial: 'editorial-pure',
  magazin: 'editorial-pure',
};

/**
 * Detect imagine mode based on message and context
 */
export function detectImagineMode(
  normalizedMessage: string,
  context: ChatContext
): 'pure' | 'sharepic' | 'edit' {
  // EDIT mode: image attached + transformation intent
  if (context.hasImageAttachment) {
    const editKeywords = [
      'transformiere',
      'bearbeite',
      'ändere',
      'begrüne',
      'verwandle',
      'mache grün',
      'grüner machen',
      'umwandeln',
    ];
    if (editKeywords.some((k) => normalizedMessage.includes(k))) {
      return 'edit';
    }
  }

  // SHAREPIC mode: explicit title mention
  const sharepicKeywords = [
    'mit titel',
    'mit dem titel',
    'mit text',
    'mit überschrift',
    'mit der überschrift',
    'titel:',
    'überschrift:',
  ];
  if (sharepicKeywords.some((k) => normalizedMessage.includes(k))) {
    return 'sharepic';
  }

  // Default to PURE mode
  return 'pure';
}

/**
 * Extract the subject/description for the image
 */
export function extractImagineSubject(
  message: string,
  mode: 'pure' | 'sharepic' | 'edit'
): string | null {
  let subject = message;

  // Remove common command prefixes
  const commandPatterns = [
    /^(?:erstelle|generiere|mache|erzeuge)\s+(?:mir\s+)?(?:ein(?:en?)?(?:e)?)\s+(?:realistisch(?:es?|er?)?|illustration|illustriert(?:es?|er?)?|pixel(?:\s*art)?|editorial|fotorealistisch(?:es?|er?)?|gemalt(?:es?|er?)?|gezeichnet(?:es?|er?)?)?\s*(?:bild|foto|illustration|grafik)\s+(?:von|über|zu|im\s+stil)?\s*/i,
    /^(?:erstelle|generiere|mache|erzeuge)\s+(?:mir\s+)?(?:ein(?:en?)?(?:e)?)\s+(?:realistisch(?:es?|er?)?|illustration|illustriert(?:es?|er?)?|pixel(?:\s*art)?|editorial|fotorealistisch(?:es?|er?)?|gemalt(?:es?|er?)?|gezeichnet(?:es?|er?)?)?\s*(?:bild|foto|illustration|grafik)\s+/i,
    /^(?:bild|foto|illustration|grafik)\s+(?:von|über|zu)?\s*/i,
    /^(?:visualisiere|illustriere)\s+(?:mir\s+)?(?:ein(?:en?)?(?:e)?)?\s*/i,
    /^(?:imagine|flux)\s*/i,
  ];

  for (const pattern of commandPatterns) {
    subject = subject.replace(pattern, '');
  }

  // Remove title specification for sharepic mode
  if (mode === 'sharepic') {
    // Match "mit dem Titel X über/von/zu Y" - keep Y as subject
    const titleSubjectMatch = subject.match(
      /mit\s+(?:dem\s+)?titel\s+\S+\s+(?:über|von|zu)\s+(.+)/i
    );
    if (titleSubjectMatch) {
      subject = titleSubjectMatch[1];
    } else {
      subject = subject.replace(/mit\s+(?:dem\s+)?titel\s+\S+\s*/i, '');
      subject = subject.replace(/titel:\s*["']?[^"'\n]+["']?\s*/i, '');
    }
  }

  // Remove variant specifications
  const variantPatterns = Object.keys(IMAGINE_VARIANT_KEYWORDS);
  for (const variant of variantPatterns) {
    subject = subject.replace(new RegExp(`\\b${variant}(?:es?|er?)?\\b`, 'gi'), '');
  }

  // Clean up
  subject = subject.replace(/\s+/g, ' ').trim();

  return subject.length > 0 ? subject : null;
}

/**
 * Extract variant/style preference
 */
export function extractImagineVariant(normalizedMessage: string): VariantResult {
  for (const [keyword, variant] of Object.entries(IMAGINE_VARIANT_KEYWORDS)) {
    if (normalizedMessage.includes(keyword)) {
      return { variant, explicit: true };
    }
  }

  // Default variant (will trigger variant selection question)
  return { variant: null, explicit: false };
}

/**
 * Extract title for sharepic mode
 */
export function extractImagineTitle(message: string): string | null {
  const titlePatterns = [
    /mit\s+(?:dem\s+)?titel\s*["']([^"']+)["']/i,
    /mit\s+(?:der?\s+)?überschrift\s*["']([^"']+)["']/i,
    /titel:\s*["']?([^"'\n]+?)["']?(?:\s|$)/i,
    /überschrift:\s*["']?([^"'\n]+?)["']?(?:\s|$)/i,
    /mit\s+(?:dem\s+)?titel\s+(\S+)/i,
    /mit\s+(?:der?\s+)?überschrift\s+(\S+)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract action/instruction for edit mode
 */
export function extractEditAction(message: string): string | null {
  // For edit mode, the action describes what transformation to apply
  const actionPatterns = [
    /(?:transformiere|verwandle|ändere|bearbeite)\s+(?:das\s+bild\s+)?(?:zu|in|so\s+dass)\s+(.+)/i,
    /(?:begrüne|mache\s+grün(?:er)?)\s+(.+)/i,
    /(.+?)\s+(?:transformieren|verwandeln|bearbeiten)/i,
  ];

  for (const pattern of actionPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Return the whole message as action if no pattern matches
  return message;
}
