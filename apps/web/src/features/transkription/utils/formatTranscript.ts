/**
 * Shared transcription formatting helpers.
 *
 * The diarized transcript from the backend uses raw `[speaker_N] text` markers.
 * These helpers resolve those markers to human-readable labels (real names from
 * `speakerMap`, else a `Sprecher*in N` fallback) so the transcript can be
 * displayed, copied, and exported to docs with consistent formatting.
 */

/**
 * Resolve a `speaker_N` id to a display label: the AI-detected name if available,
 * otherwise a 1-based `Sprecher*in N` fallback.
 */
export function getSpeakerLabel(id: string, speakerMap?: Record<string, string>): string {
  if (speakerMap?.[id]) return speakerMap[id];
  const match = id.match(/speaker_(\d+)/);
  if (!match) return id;
  return `Sprecher*in ${parseInt(match[1]) + 1}`;
}

/**
 * Convert a diarized transcript (with `[speaker_N]` markers) into clean Markdown
 * with bold, resolved speaker labels per block. Non-diarized text (plain or
 * already Markdown, e.g. a generated Protokoll) is returned unchanged so it flows
 * through the shared copy/export utils as-is.
 */
export function transcriptToMarkdown(text: string, speakerMap?: Record<string, string>): string {
  if (!text) return '';
  if (!text.includes('[speaker_')) return text;

  const parts = text.split(/(\[speaker_\d+\])/g).filter(Boolean);
  const blocks: string[] = [];
  let currentSpeaker = '';

  for (const part of parts) {
    if (part.startsWith('[speaker_')) {
      currentSpeaker = part.slice(1, -1);
    } else {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const label = currentSpeaker ? getSpeakerLabel(currentSpeaker, speakerMap) : '';
      blocks.push(label ? `**${label}:** ${trimmed}` : trimmed);
    }
  }

  return blocks.join('\n\n');
}
