import { z } from 'zod';

import { stripHandMarks } from '../../text/handMarks.js';
import { stripInlineMarks } from '../../text/inlineMarks.js';

/** Inline and hand marks (`==`, `++`, `**`, `((` …) take no room on the slide: only what it shows counts. */
export const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .superRefine((text, ctx) => {
      if (stripInlineMarks(stripHandMarks(text)).length <= max) return;
      ctx.addIssue({
        code: 'too_big',
        origin: 'string',
        maximum: max,
        inclusive: true,
        message: `String must contain at most ${max} visible character(s)`,
      });
    });

export const sharepicAccentSchema = z.union([
  z.number().int().min(0),
  z.array(z.number().int().min(0)).min(1).max(4),
]);
/** The accent line indices, whatever form the spec gives them in. */
export function accentLines(akzent: number | number[] | undefined): number[] {
  return akzent === undefined ? [] : Array.isArray(akzent) ? akzent : [akzent];
}

/**
 * One line of free text that ends up in a prompt: control characters, line
 * breaks and backticks become spaces, so a field cannot open a section or close
 * a fence. The length is capped before and after the clean-up.
 */
export const oneLine = (max: number) =>
  z
    .string()
    .max(max * 4)
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .transform((value) => value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029`]+/g, ' '))
    .pipe(z.string().trim().min(1).max(max));
