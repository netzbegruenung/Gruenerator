import {
  analyzeTextFormBodySchema,
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
  saveTextFormBodySchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const example = (chars: number) => ({ content: 'x'.repeat(chars) });

describe('analyze needs a label', () => {
  // The reported bug: the client dropped an empty title from the body, both
  // fields were optional, so Zod passed and only the handler refused with
  // "textType oder title ist erforderlich." The contract now carries it.
  it('rejects a body with no title at all', () => {
    expect(analyzeTextFormBodySchema.safeParse({ examples: [example(10)] }).success).toBe(false);
  });

  it('rejects a whitespace-only title', () => {
    const parsed = analyzeTextFormBodySchema.safeParse({
      title: '   ',
      examples: [example(10)],
    });
    expect(parsed.success).toBe(false);
  });

  it('still requires the title when a preset textType is given', () => {
    const parsed = analyzeTextFormBodySchema.safeParse({
      textType: 'presse',
      examples: [example(10)],
    });
    expect(parsed.success).toBe(false);
  });

  it('trims the title it passes through', () => {
    const parsed = analyzeTextFormBodySchema.safeParse({
      title: '  Newsletter Intro  ',
      examples: [example(10)],
    });
    expect(parsed.success && parsed.data.title).toBe('Newsletter Intro');
  });

  // Das Eingabefeld ließ 100 Zeichen zu, beide Schemata deckeln bei 80 — die
  // Grenze steht jetzt als Konstante, an der auch das Feld hängt.
  it('caps both bodies at the one title length', () => {
    const tooLong = 'x'.repeat(MAX_TEXT_FORM_TITLE_CHARS + 1);
    expect(
      analyzeTextFormBodySchema.safeParse({ title: tooLong, examples: [example(10)] }).success
    ).toBe(false);
    expect(
      saveTextFormBodySchema.safeParse({
        title: tooLong,
        examples: [],
        styleBlock: 'Schreibe kurz.',
      }).success
    ).toBe(false);
    expect(
      analyzeTextFormBodySchema.safeParse({
        title: 'x'.repeat(MAX_TEXT_FORM_TITLE_CHARS),
        examples: [example(10)],
      }).success
    ).toBe(true);
  });
});

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
