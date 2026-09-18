/**
 * Tests for the recipe-draft synthesis service.
 *
 * Mocks `ai.generateObject` and `getModel` so no real model call happens;
 * asserts on the post-clamps (icon default, mention collision loop, mention
 * derived from title on an invalid slug, styleBlock truncation) and on the
 * party-internal boundary (no `internalPrompts` import in the module source).
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormDraftService.vitest.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MAX_TEXT_FORM_STYLE_CHARS } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

const mockGetModel = vi.fn(() => ({ id: 'mock-model' }));
vi.mock('../ai/providers.js', () => ({
  getModel: (...args: unknown[]) => mockGetModel(...args),
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

function mockDraftResult(draft: Record<string, unknown>): void {
  mockGenerateObject.mockResolvedValue({ object: draft });
}

beforeEach(() => {
  mockGenerateObject.mockReset();
  mockGetModel.mockClear();
});

describe('draftRecipeSpec', () => {
  it('calls getModel with mistral, same lane as the agent draft service', async () => {
    mockDraftResult(baseDraft());
    await draftRecipeSpec({
      messages: [{ role: 'user', content: 'Beschreibung' }],
      takenMentions: new Set(),
    });
    expect(mockGetModel).toHaveBeenCalledWith('mistral');
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
