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
 *
 * The backend emits one `[speaker_N]` marker per diarized segment (often several
 * short segments per sentence), so runs of consecutive segments from the same
 * speaker are merged into a single block here — otherwise the label would repeat
 * mid-paragraph for every segment instead of once per speaker turn.
 */
export function transcriptToMarkdown(text: string, speakerMap?: Record<string, string>): string {
  if (!text) return '';
  if (!text.includes('[speaker_')) return text;

  const parts = text.split(/(\[speaker_\d+\])/g).filter(Boolean);
  const blocks: { speaker: string; text: string }[] = [];
  let currentSpeaker = '';

  for (const part of parts) {
    if (part.startsWith('[speaker_')) {
      currentSpeaker = part.slice(1, -1);
    } else {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const last = blocks[blocks.length - 1];
      if (last && last.speaker === currentSpeaker) {
        last.text = `${last.text} ${trimmed}`;
      } else {
        blocks.push({ speaker: currentSpeaker, text: trimmed });
      }
    }
  }

  return blocks
    .map(({ speaker, text: blockText }) => {
      const label = speaker ? getSpeakerLabel(speaker, speakerMap) : '';
      return label ? `**${label}:** ${blockText}` : blockText;
    })
    .join('\n\n');
}
