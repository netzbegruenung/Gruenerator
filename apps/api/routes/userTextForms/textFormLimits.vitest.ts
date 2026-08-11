import {
  analyzeTextFormBodySchema,
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  saveTextFormBodySchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const example = (chars: number) => ({ content: 'x'.repeat(chars) });

describe('text form example limits', () => {
  it('accepts the full number of examples within the char budget', () => {
    const each = Math.floor(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS / MAX_TEXT_FORM_EXAMPLES);
    const parsed = analyzeTextFormBodySchema.safeParse({
      title: 'Rezept',
      examples: Array.from({ length: MAX_TEXT_FORM_EXAMPLES }, () => example(each)),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects more examples than the cap', () => {
    const parsed = analyzeTextFormBodySchema.safeParse({
      title: 'Rezept',
      examples: Array.from({ length: MAX_TEXT_FORM_EXAMPLES + 1 }, () => example(10)),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a few examples that together blow the char budget', () => {
    const parsed = analyzeTextFormBodySchema.safeParse({
      title: 'Rezept',
      examples: [
        example(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS),
        example(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS),
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('lets a single undivided paste use the whole budget', () => {
    const parsed = analyzeTextFormBodySchema.safeParse({
      title: 'Rezept',
      examples: [example(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)],
    });
    expect(parsed.success).toBe(true);
  });

  it('applies the same aggregate budget on save', () => {
    const body = {
      kind: 'custom' as const,
      title: 'Rezept',
      styleBlock: '## STIL',
      examples: [example(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS + 1)],
    };
    expect(saveTextFormBodySchema.safeParse(body).success).toBe(false);
  });
});
