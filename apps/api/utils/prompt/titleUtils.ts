import type { FormData, ContentType } from './types.js';

export function generateSmartTitle(
  contentType: ContentType,
  formData: FormData = {},
  extractedTitle: string | null = null
): string {
  if (extractedTitle && extractedTitle.trim()) {
    return extractedTitle.trim();
  }

  switch (contentType) {
    case 'antrag':
      return `Antrag: ${formData.idee || formData.thema || 'Unbenannt'}`;
    case 'kleine_anfrage':
      return `Kleine Anfrage: ${formData.idee || formData.thema || 'Unbenannt'}`;
    case 'grosse_anfrage':
      return `Große Anfrage: ${formData.idee || formData.thema || 'Unbenannt'}`;
    case 'pressemitteilung':
      return `Pressemitteilung: ${formData.thema || 'Unbenannt'}`;
    case 'rede':
      return `Rede: ${formData.thema || 'Unbenannt'}`;
    case 'wahlprogramm':
      return `Wahlprogramm-Kapitel: ${formData.thema || 'Unbenannt'}`;
    case 'instagram':
      return `Instagram-Post: ${formData.thema || 'Unbenannt'}`;
    case 'facebook':
      return `Facebook-Post: ${formData.thema || 'Unbenannt'}`;
    case 'twitter':
      return `Twitter-Post: ${formData.thema || 'Unbenannt'}`;
    case 'linkedin':
      return `LinkedIn-Post: ${formData.thema || 'Unbenannt'}`;
    case 'actionIdeas':
      return `Aktionsideen: ${formData.thema || 'Unbenannt'}`;
    case 'reelScript':
      return `Reel-Script: ${formData.thema || 'Unbenannt'}`;
    case 'universal':
      return `${formData.textForm || 'Text'}: ${formData.thema || 'Unbenannt'}`;
    default:
      if (contentType.startsWith('gruene_jugend_')) {
        const platform = contentType.replace('gruene_jugend_', '');
        return `Grüne Jugend ${platform}: ${formData.thema || 'Unbenannt'}`;
      }
      return `${contentType}: ${formData.thema || formData.idee || 'Unbenannt'}`;
  }
}

export function extractTitleFromResponse(
  content: string,
  contentType: ContentType,
  formData: FormData = {}
): string {
  if (!content || typeof content !== 'string') {
    return generateSmartTitle(contentType, formData);
  }

  console.log('[extractTitleFromResponse] Processing content length:', content.length);
  console.log(
    '[extractTitleFromResponse] Content preview (last 200 chars):',
    content.substring(content.length - 200)
  );

  const titlePatterns: RegExp[] = [
    /<GRUEN_TITLE>(.*?)<\/GRUEN_TITLE>/s,
    /<h[2-6]>Titel:<\/h[2-6]>\s*<p>(.+?)<\/p>/i,
    /<h[2-6]>Titel:<\/h[2-6]>\s*\n\s*<p>(.+?)<\/p>/i,
    /Titel:\s*(.+)$/im,
    /Titel:<\/h[2-6]>\s*(?:\n\s*){0,10}<p>(.+?)<\/p>/i,
    /<p>([^<]+)<\/p>\s*$/i,
  ];

  for (let i = 0; i < titlePatterns.length; i++) {
    const pattern = titlePatterns[i];
    const titleMatch = content.match(pattern);

    console.log(`[extractTitleFromResponse] Trying pattern ${i + 1}:`, pattern.toString());

    if (titleMatch && titleMatch[1]) {
      let extractedTitle = titleMatch[1].trim();

      console.log(`[extractTitleFromResponse] Pattern ${i + 1} matched:`, extractedTitle);

      if (i > 0 && (extractedTitle.includes('<') || extractedTitle.includes('>'))) {
        console.log(`[extractTitleFromResponse] Skipping pattern ${i + 1} - contains HTML tags`);
        continue;
      }

      extractedTitle = extractedTitle.replace(/[.!?]+$/, '');

      if (extractedTitle.length > 60) {
        extractedTitle = extractedTitle.substring(0, 60).trim() + '...';
      }

      if (extractedTitle.length > 0) {
        console.log(
          `[extractTitleFromResponse] Successfully extracted title using pattern ${i + 1}:`,
          extractedTitle
        );
        return extractedTitle;
      }
    } else {
      console.log(`[extractTitleFromResponse] Pattern ${i + 1} did not match`);
    }
  }

  console.log(
    '[extractTitleFromResponse] No title pattern matched, falling back to smart title generation'
  );

  return generateSmartTitle(contentType, formData);
}
