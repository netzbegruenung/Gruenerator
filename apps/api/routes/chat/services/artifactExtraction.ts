/**
 * Artifact Extraction
 *
 * Pulls a renderable artifact (a fenced ```html or ```svg block) out of an
 * assistant response so the controller can emit it as an `artifact` SSE event.
 * The frontend renders it live in a sandboxed side panel. Mirrors
 * extractChartFromResponse (confirmActionService.ts) in shape and intent.
 *
 * Scoped to HTML/CSS and SVG only — no executable React — so the frontend can
 * render it inside a locked-down sandboxed iframe.
 */

import { createLogger } from '../../../utils/logger.js';

import type { ArtifactData } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ArtifactExtraction');

/** Minimum content length to treat a fenced block as a real artifact (avoids
 *  emitting a panel for a one-line snippet the user just wanted to read). */
const MIN_ARTIFACT_LENGTH = 40;

function deriveTitle(type: 'html' | 'svg', content: string): string {
  if (type === 'html') {
    const titleTag = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTag) return titleTag[1].trim();
    const heading = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (heading) return heading[1].trim();
    return 'HTML-Artefakt';
  }
  return 'SVG-Grafik';
}

/**
 * Extract the first ```html or ```svg fenced block from the response, if any.
 * Returns null when no artifact block is present.
 */
export function extractArtifactFromResponse(text: string): ArtifactData | null {
  const match = text.match(/```(html|svg)\s*\n?([\s\S]*?)```/i);
  if (!match) return null;

  const type = match[1].toLowerCase() as 'html' | 'svg';
  const content = match[2].trim();

  if (content.length < MIN_ARTIFACT_LENGTH) return null;

  // Sanity check the SVG actually opens an <svg> element — guards against a
  // fenced block mislabeled `svg` that is really prose.
  if (type === 'svg' && !/<svg[\s>]/i.test(content)) {
    log.warn('[ChatGraph] ```svg block without an <svg> element — skipping');
    return null;
  }

  return { type, title: deriveTitle(type, content), content };
}
