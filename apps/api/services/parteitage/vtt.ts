/** WebVTT captions built from a speech's stored words (seconds relative to the reel). */
import type { SubtitleWord } from '@gruenerator/contracts';

const MAX_WORDS = 7;
const MAX_CUE_S = 3.5;

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}

/** Cues of at most 7 words or 3.5 s. Returns null when there are no words. */
export function buildVtt(words: SubtitleWord[]): string | null {
  const usable = words.filter((w) => w.word.trim() !== '');
  if (usable.length === 0) return null;

  const cues: SubtitleWord[][] = [];
  let current: SubtitleWord[] = [];
  for (const w of usable) {
    if (
      current.length > 0 &&
      (current.length >= MAX_WORDS || w.end - current[0]!.start > MAX_CUE_S)
    ) {
      cues.push(current);
      current = [];
    }
    current.push(w);
  }
  cues.push(current);

  const body = cues.map((cue) => {
    const start = cue[0]!.start;
    const end = Math.max(cue[cue.length - 1]!.end, start + 0.1);
    return `${timestamp(start)} --> ${timestamp(end)}\n${cue.map((w) => w.word.trim()).join(' ')}`;
  });
  return `WEBVTT\n\n${body.join('\n\n')}\n`;
}
