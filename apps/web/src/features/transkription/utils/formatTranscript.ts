/**
 * Shared transcription formatting helpers.
 *
 * The diarized transcript from the backend uses raw `[speaker_N] text` markers.
 * These helpers resolve those markers to human-readable labels (real names from
 * `speakerMap`, else a `Sprecher*in N` fallback) so the transcript can be
 * displayed, copied, and exported to docs with consistent formatting.
 */

export interface SpeakerBlock {
  /** The raw `speaker_N` id, or '' for text that appeared before any marker. */
  speaker: string;
  text: string;
  /**
   * Character offset of the block's start in the source transcript. Unique and
   * stable, so it works as a React key where the array index would not: the
   * same speaker holds many turns, and blocks shift as text is appended.
   */
  offset: number;
}

/**
 * Split a diarized transcript into one block per speaker *turn*.
 *
 * The backend emits one `[speaker_N]` marker per diarized segment — often
 * several per sentence — so a naive "one block per marker" reading repeats the
 * speaker's name mid-paragraph. Consecutive segments from the same speaker are
 * merged here instead.
 *
 * This lives in one place because it did not use to: the renderer and the
 * Markdown serialiser each had their own copy, and the same repeated-label bug
 * had to be fixed in both.
 */
export function parseSpeakerBlocks(text: string): SpeakerBlock[] {
  const parts = text.split(/(\[speaker_\d+\])/g).filter(Boolean);
  const blocks: SpeakerBlock[] = [];
  let currentSpeaker = '';
  let offset = 0;

  for (const part of parts) {
    const partOffset = offset;
    offset += part.length;

    if (part.startsWith('[speaker_')) {
      currentSpeaker = part.slice(1, -1);
      continue;
    }
    const trimmed = part.trim();
    if (!trimmed) continue;

    const last = blocks[blocks.length - 1];
    if (last && last.speaker === currentSpeaker) {
      last.text = `${last.text} ${trimmed}`;
    } else {
      blocks.push({ speaker: currentSpeaker, text: trimmed, offset: partOffset });
    }
  }

  return blocks;
}

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

  return parseSpeakerBlocks(text)
    .map(({ speaker, text: blockText }) => {
      const label = speaker ? getSpeakerLabel(speaker, speakerMap) : '';
      return label ? `**${label}:** ${blockText}` : blockText;
    })
    .join('\n\n');
}
