/**
 * Tests for the agent-draft synthesis service.
 *
 * Mocks `aiObject` so that it runs the service's own `validate` on a canned
 * draft; asserts that `validate` does not reject what the post-clamps already
 * repair (GlitchTip #683: a fifth opening question 500'd the whole draft) and
 * that the clamps run.
 *
 * Run with: cd apps/api && npx vitest run services/userAgents/agentDraftService.vitest.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AiObjectCall, type StructuredResult } from '../ai/generate.js';

const mockAiObject = vi.fn();
vi.mock('../ai/generate.js', () => ({
  aiObject: (...args: unknown[]) => mockAiObject(...args),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { draftAgentSpec } = await import('./agentDraftService.js');

function oversizedDraft(): Record<string, unknown> {
  return {
    title: 'T'.repeat(200),
    description: 'D'.repeat(800),
    systemRoleBlocks: ['Du bist die Pressestelle des Kreisverbands.'],
    iconKey: 'PiMegaphone',
    backgroundColor: '#316049',
    enabledTools: [],
    defaultRecipeMention: null,
    locale: 'de-DE',
    openingMessage: 'Hallo!',
    openingQuestions: ['1', '2', '3', '4', '5'],
  };
}

/** Answers like `aiObject` would after one model turn that returned `draft`. */
function modelReturns(draft: Record<string, unknown>): void {
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

describe('draftAgentSpec', () => {
  it('runs on the creator_draft lane', async () => {
    modelReturns(oversizedDraft());
    await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    expect(mockAiObject).toHaveBeenCalledWith(expect.objectContaining({ lane: 'creator_draft' }));
  });

  it('validates oversized fields as ok, so the clamps can run', async () => {
    modelReturns(oversizedDraft());
    await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    const call = mockAiObject.mock.calls[0][0] as AiObjectCall<unknown>;
    expect(call.validate(oversizedDraft(), 1, 2).ok).toBe(true);
  });

  it('rejects a systemRole below the create-contract minimum', async () => {
    modelReturns(oversizedDraft());
    await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    const call = mockAiObject.mock.calls[0][0] as AiObjectCall<unknown>;
    const result = call.validate({ ...oversizedDraft(), systemRoleBlocks: ['kurz', ' '] }, 1, 2);
    expect(result.ok).toBe(false);
  });

  it('throws when no attempt produced a valid draft', async () => {
    mockAiObject.mockResolvedValue({ ok: false, error: 'No provider produced an answer' });
    await expect(draftAgentSpec([{ role: 'user', content: 'Pressestelle' }])).rejects.toThrow(
      'No provider produced an answer'
    );
  });

  it('clamps title, description and opening questions to the create contract', async () => {
    modelReturns(oversizedDraft());
    const spec = await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    expect(spec.title.length).toBe(100);
    expect(spec.description.length).toBe(500);
    expect(spec.openingQuestions).toEqual(['1', '2', '3', '4']);
  });

  it('joins role blocks into paragraphs and keeps a list tight (#5591)', async () => {
    modelReturns({
      ...oversizedDraft(),
      systemRoleBlocks: [
        'Du bist die Pressestelle.',
        ' ',
        'Grundregeln:',
        '- nur belegte Fakten',
        '- kurze Sätze',
        'Bleib freundlich.',
      ],
    });
    const spec = await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    expect(spec.systemRole).toBe(
      'Du bist die Pressestelle.\n\nGrundregeln:\n\n- nur belegte Fakten\n- kurze Sätze\n\nBleib freundlich.'
    );
  });

  describe('defaultRecipeMention', () => {
    const catalog = [
      {
        key: 'pressemitteilung',
        mention: 'pressemitteilung',
        title: 'Pressemitteilung',
        description: '',
        source: 'system' as const,
        id: null,
        origin: 'system' as const,
        ownerName: null,
      },
    ];

    it('keeps a recipe from the caller catalogue', async () => {
      modelReturns({ ...oversizedDraft(), defaultRecipeMention: 'pressemitteilung' });
      const spec = await draftAgentSpec([{ role: 'user', content: 'Presse' }], catalog);
      expect(spec.defaultRecipeMention).toBe('pressemitteilung');
    });

    // GlitchTip #690/#691: the draft offered every SKILLS entry, the save then
    // rejected `@buerger-at` / `@sprechzettel` with 400.
    it('drops a recipe outside the caller catalogue and does not offer it', async () => {
      modelReturns({ ...oversizedDraft(), defaultRecipeMention: 'buerger-at' });
      const spec = await draftAgentSpec([{ role: 'user', content: 'Presse' }], catalog);
      expect(spec.defaultRecipeMention).toBeNull();
      const call = mockAiObject.mock.calls[0][0] as AiObjectCall<unknown>;
      expect(call.system).toContain('- pressemitteilung: Pressemitteilung');
      expect(call.system).not.toContain('buerger-at');
    });

    describe('mention collision', () => {
      const collided = [
        {
          ...catalog[0],
          key: 'antrag',
          mention: 'antrag',
          title: 'Antrag',
          origin: 'own' as const,
        },
        {
          ...catalog[0],
          key: 'antrag-abc123',
          mention: 'antrag',
          title: 'Antrag',
          source: 'user' as const,
          origin: 'library' as const,
          ownerName: 'Erika',
        },
      ];

      it('offers two distinguishable lines', async () => {
        modelReturns({ ...oversizedDraft(), defaultRecipeMention: 'antrag' });
        await draftAgentSpec([{ role: 'user', content: 'Antrag' }], collided);
        const call = mockAiObject.mock.calls[0][0] as AiObjectCall<unknown>;
        expect(call.system).toContain('- antrag: Antrag\n');
        expect(call.system).toContain('- antrag-abc123: Antrag (von Erika)');
      });

      it('persists the mention of the own row', async () => {
        modelReturns({ ...oversizedDraft(), defaultRecipeMention: 'antrag' });
        const spec = await draftAgentSpec([{ role: 'user', content: 'Antrag' }], collided);
        expect(spec.defaultRecipeMention).toBe('antrag');
      });

      it('does not bind the foreign row, its mention would resolve to the own one', async () => {
        modelReturns({ ...oversizedDraft(), defaultRecipeMention: 'antrag-abc123' });
        const spec = await draftAgentSpec([{ role: 'user', content: 'Antrag' }], collided);
        expect(spec.defaultRecipeMention).toBeNull();
      });
    });

    it('binds no recipe without a catalogue', async () => {
      modelReturns({ ...oversizedDraft(), defaultRecipeMention: 'pressemitteilung' });
      const spec = await draftAgentSpec([{ role: 'user', content: 'Presse' }]);
      expect(spec.defaultRecipeMention).toBeNull();
    });
  });
});
