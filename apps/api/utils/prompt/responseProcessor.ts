import type { AIWorkerResult, EnhancedAIWorkerResult, FormData } from './types.js';
import { detectContentType } from './contentType.js';
import { extractTitleFromResponse } from './titleUtils.js';

const SOCIAL_LIKE_TYPES = new Set([
  'instagram',
  'facebook',
  'twitter',
  'linkedin',
  'social',
  'press',
  'pressemitteilung',
  'actionIdeas',
  'reelScript'
]);

export function sanitizeMarkdownForDisplay(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let out = text.trim();

  const fullFence = /^(?:```|~~~)([a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n(?:```|~~~)\s*$/;
  const m = out.match(fullFence);
  if (m) {
    out = m[2].trim();
  } else {
    const fenceGlobal = /```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/g;
    const matches = [...out.matchAll(fenceGlobal)];
    if (matches.length === 1) {
      const inner = matches[0][1];
      const around = out.replace(matches[0][0], '').trim();
      if (around.length <= 40) {
        out = (around ? around + '\n\n' : '') + inner.trim();
      }
    }
  }

  const lines = out.split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length >= 3) {
    const indented = nonEmpty.filter(l => /^\s{4,}/.test(l)).length;
    if (indented / nonEmpty.length >= 0.75) {
      out = lines.map(l => l.replace(/^\s{4}/, '')).join('\n').trim();
    }
  }

  return out;
}

export function processResponseWithTitle(
  result: AIWorkerResult,
  routePath: string,
  formData: FormData = {}
): EnhancedAIWorkerResult {
  if (!result || !result.success || !result.content) {
    return result;
  }

  const contentType = detectContentType(routePath, formData);

  const extractedTitle = extractTitleFromResponse(result.content, contentType, formData);

  let cleanContent = result.content;

  const gruentitleMatch = result.content.match(/<GRUEN_TITLE>.*?<\/GRUEN_TITLE>/s);
  if (gruentitleMatch) {
    cleanContent = result.content.replace(/<GRUEN_TITLE>.*?<\/GRUEN_TITLE>/s, '').trim();
    console.log('[processResponseWithTitle] Removed GRUEN_TITLE markers from content');
  } else {
    const titleMatch = result.content.match(/Titel:\s*(.+)$/im);
    if (titleMatch) {
      cleanContent = result.content.replace(/\n*Titel:\s*(.+)$/im, '').trim();
      console.log('[processResponseWithTitle] Removed legacy title line from content');
    }
  }

  if (SOCIAL_LIKE_TYPES.has(contentType)) {
    cleanContent = sanitizeMarkdownForDisplay(cleanContent);
  }

  if (contentType === 'twitter') {
    cleanContent = cleanContent.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  return {
    ...result,
    content: cleanContent,
    metadata: {
      ...result.metadata,
      title: extractedTitle,
      contentType: contentType
    }
  };
}
