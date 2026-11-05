import { foundedInBrief, wordsOf } from './briefFacts.js';
import { type DatumRepair } from './datumRepair.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The model's `ort` may only carry a place the order or its material names
 * (#5347: „Online-Meeting / Link via Mail" for an order without a place). An
 * invented line is dropped (and reported) instead of rejecting the draft; an
 * `ort` left without lines goes entirely. Works on the raw model JSON, before
 * the schema.
 */
export function repairOrt(
  input: unknown,
  given: string
): { input: unknown; repairs: DatumRepair[] } {
  if (!isRecord(input) || !Array.isArray(input.slides)) return { input, repairs: [] };
  const repairs: DatumRepair[] = [];
  const givenWords = wordsOf(given);

  const slides = input.slides.map((slide: unknown, index) => {
    if (!isRecord(slide) || !isRecord(slide.ort) || !Array.isArray(slide.ort.lines)) return slide;
    const lines = slide.ort.lines.filter((l): l is string => typeof l === 'string');
    const kept = lines.filter((line) => line.trim() && foundedInBrief(line, givenWords));
    if (kept.length === slide.ort.lines.length) return slide;
    const dropped = lines.filter((line) => !kept.includes(line)).join(' / ');
    repairs.push({ slide: index, feld: 'ort', wert: dropped });
    const { ort, ...rest } = slide;
    return kept.length ? { ...rest, ort: { ...ort, lines: kept } } : rest;
  });
  return { input: { ...input, slides }, repairs };
}
