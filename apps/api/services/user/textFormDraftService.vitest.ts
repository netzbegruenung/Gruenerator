/**
 * Tests for the recipe-draft synthesis service.
 *
 * Mocks `aiObject` (running the service's own `validate` on a canned draft) so
 * no real model call happens;
 * asserts on the post-clamps (icon default, mention collision loop, mention
 * derived from title on an invalid slug, styleBlock truncation) and on the
 * party-internal boundary (no `internalPrompts` import in the module source).
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormDraftService.vitest.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MAX_TEXT_FORM_STYLE_CHARS, textFormMentionSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AiObjectCall, type StructuredResult } from '../ai/generate.js';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockAiObject = vi.fn();
vi.mock('../ai/generate.js', () => ({
  aiObject: (...args: unknown[]) => mockAiObject(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Import after mocks ──────────────────────────────────────

const { draftRecipeSpec } = await import('./textFormDraftService.js');

/** A minimal, otherwise-valid draft object returned by the mocked model. */
function baseDraft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    title: 'Einladung Ortsverband',
    mention: 'einladung-ortsverband',
    description: 'Lädt zu Ortsverbandstreffen ein.',
    iconKey: 'PiCalendarBlank',
    styleBlock:
      '## Zweck\n\nLädt zu Treffen ein.\n\n## Aufbau und Struktur\n\nKurz und knapp.\n\n## Tonalität und Ansprache\n\nFreundlich, Du-Form.\n\n## Länge und Format\n\nMax. 500 Zeichen.\n\n## Was vermieden wird\n\nKeine Fachbegriffe.',
    ...overrides,
  };
}

/** Answers like `aiObject` would after one model turn that returned `draft`. */
function mockDraftResult(draft: Record<string, unknown>): void {
  mockAiObject.mockImplementation((call: AiObjectCall<unknown>): StructuredResult<unknown> => {
    const validated = call.validate(draft, 1, 2);
    return validated.ok
      ? { ok: true, data: validated.value }
      : { ok: false, error: validated.error };
  });
}

beforeEach(() => {
  mockAiObject.mockReset();
});

describe('draftRecipeSpec', () => {
  it('runs on the creator_draft lane, same as the agent draft service', async () => {
    mockDraftResult(baseDraft());
    await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(mockAiObject).toHaveBeenCalledWith(expect.objectContaining({ lane: 'creator_draft' }));
  });

  it('throws when no attempt produced a valid draft', async () => {
    mockAiObject.mockResolvedValue({ ok: false, error: 'No provider produced an answer' });
    await expect(
      draftRecipeSpec({
        messages: [{ role: 'user', content: 'Beschreibung' }],
        takenMentions: new Set(),
      })
    ).rejects.toThrow('No provider produced an answer');
  });

  it('keeps a mention that is not taken', async () => {
    mockDraftResult(baseDraft());
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(spec.mention).toBe('einladung-ortsverband');
  });

  it('appends -2 when the mention is already taken', async () => {
    mockDraftResult(baseDraft({ mention: 'einladung-ortsverband' }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(['einladung-ortsverband']),
    });
    expect(spec.mention).toBe('einladung-ortsverband-2');
  });

  it('walks past several taken suffixes to the next free one', async () => {
    mockDraftResult(baseDraft({ mention: 'presse' }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(['presse', 'presse-2', 'presse-3']),
    });
    expect(spec.mention).toBe('presse-4');
  });

  it('falls through to a random suffix once every -2..-20 candidate is taken', async () => {
    mockDraftResult(baseDraft({ mention: 'presse' }));
    // 'presse' itself plus 'presse-2'..'presse-20' — every candidate the
    // fixed numeric loop could produce is occupied, forcing the random-draw
    // branch in resolveMentionCollision.
    const taken = new Set(['presse', ...Array.from({ length: 19 }, (_, i) => `presse-${i + 2}`)]);
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: taken,
    });
    expect(spec.mention.startsWith('presse-')).toBe(true);
    expect(taken.has(spec.mention)).toBe(false);
    expect(textFormMentionSchema.safeParse(spec.mention).success).toBe(true);
  });

  it('truncates a near-max-length base mention so the collision suffix still fits 48 chars', async () => {
    const longMention = 'a'.repeat(48);
    mockDraftResult(baseDraft({ mention: longMention }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set([longMention]),
    });
    expect(spec.mention.length).toBeLessThanOrEqual(48);
    expect(spec.mention.endsWith('-2')).toBe(true);
    expect(textFormMentionSchema.safeParse(spec.mention).success).toBe(true);
  });

  it('derives the mention from the title when the model mention is an invalid slug', async () => {
    mockDraftResult(baseDraft({ title: 'Presse Mitteilung', mention: 'Not A Valid Slug!!' }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(spec.mention).toBe('presse-mitteilung');
  });

  it('falls back to the default icon when the model icon is outside the catalog', async () => {
    mockDraftResult(baseDraft({ iconKey: 'PiNotARealIcon' }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(spec.iconKey).toBe('PiSparkle');
  });

  it('keeps a catalog icon as-is', async () => {
    mockDraftResult(baseDraft({ iconKey: 'PiMegaphone' }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(spec.iconKey).toBe('PiMegaphone');
  });

  it('clamps an oversized styleBlock to MAX_TEXT_FORM_STYLE_CHARS', async () => {
    const oversized = 'x'.repeat(MAX_TEXT_FORM_STYLE_CHARS + 500);
    mockDraftResult(baseDraft({ styleBlock: oversized }));
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(spec.styleBlock.length).toBe(MAX_TEXT_FORM_STYLE_CHARS);
  });

  it('clamps an oversized title and description', async () => {
    mockDraftResult(
      baseDraft({
        title: 'T'.repeat(200),
        description: 'D'.repeat(800),
      })
    );
    const spec = await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(spec.title.length).toBe(80);
    expect(spec.description.length).toBe(500);
  });

  it('validates oversized fields as ok, so the clamps can run', async () => {
    mockDraftResult(baseDraft());
    await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    const call = mockAiObject.mock.calls[0][0] as AiObjectCall<unknown>;
    const oversized = baseDraft({
      title: 'T'.repeat(200),
      mention: 'm'.repeat(80),
      description: 'D'.repeat(800),
    });
    expect(call.validate(oversized, 1, 2).ok).toBe(true);
  });

  it('rejects a styleBlock below the save-body minimum', async () => {
    mockDraftResult(baseDraft());
    await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    const call = mockAiObject.mock.calls[0][0] as AiObjectCall<unknown>;
    expect(call.validate(baseDraft({ styleBlock: 'zu kurz' }), 1, 2).ok).toBe(false);
  });
});

describe('party-internal boundary', () => {
  it('does not import services/skills/internalPrompts.js', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./textFormDraftService.ts', import.meta.url)),
      'utf8'
    );
    expect(source).not.toContain('internalPrompts');
  });
});
