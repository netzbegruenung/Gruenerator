/**
 * Hints about the material, shown with the first plan: what no cut can fix
 * ("Unschärfe rettet kein Schnitt"). Loudness is not among them on purpose —
 * the detectors read the levelled working copy, where every clip is at
 * -14 LUFS by construction.
 */
import { type StoredClipAnalysis } from './projectTypes.js';

/** Fewer words than this in a footage clip means hardly anything is said. */
export const MIN_FOOTAGE_WORDS = 10;
/** Share of a clip that has to be soft or dark before it is worth a word. */
export const QUALITY_SHARE = 0.5;

export function materialWarnings(
  clips: readonly StoredClipAnalysis[],
  titles: ReadonlyMap<string, string>
): string[] {
  const warnings: string[] = [];
  for (const clip of clips) {
    const name = `„${titles.get(clip.clipId) ?? clip.clipId}“`;
    if (clip.role === 'footage' && clip.words.length < MIN_FOOTAGE_WORDS) {
      warnings.push(`In ${name} wird kaum gesprochen.`);
    }
    for (const flag of ['unscharf', 'dunkel'] as const) {
      const seconds = clip.detectors.quality
        .filter((r) => r.flag === flag)
        .reduce((sum, r) => sum + (r.end - r.start), 0);
      if (clip.duration > 0 && seconds / clip.duration > QUALITY_SHARE) {
        warnings.push(`${name} ist über weite Strecken ${flag}.`);
      }
    }
  }
  return warnings;
}
