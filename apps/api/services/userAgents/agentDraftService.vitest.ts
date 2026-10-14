/**
 * Tests for the agent-draft synthesis service.
 *
 * Mocks `ai.generateObject` and `getModel`; asserts that the generation schema
 * does not reject what the post-clamps already repair (GlitchTip #683: a fifth
 * opening question 500'd the whole draft) and that the clamps run.
 *
 * Run with: cd apps/api && npx vitest run services/userAgents/agentDraftService.vitest.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type z } from 'zod';

const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
}));

vi.mock('../ai/providers.js', () => ({
  getModel: () => ({ id: 'mock-model' }),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { draftAgentSpec } = await import('./agentDraftService.js');

function oversizedDraft(): Record<string, unknown> {
  return {
    title: 'T'.repeat(200),
    description: 'D'.repeat(800),
    systemRole: 'Du bist die Pressestelle des Kreisverbands.',
    iconKey: 'PiMegaphone',
    backgroundColor: '#316049',
    enabledTools: [],
    defaultRecipeMention: null,
    locale: 'de-DE',
    openingMessage: 'Hallo!',
    openingQuestions: ['1', '2', '3', '4', '5'],
  };
}

beforeEach(() => {
  mockGenerateObject.mockReset();
});

describe('draftAgentSpec', () => {
  it('passes a generation schema that accepts oversized fields', async () => {
    mockGenerateObject.mockResolvedValue({ object: oversizedDraft() });
    await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    const { schema } = mockGenerateObject.mock.calls[0][0] as { schema: z.ZodTypeAny };
    expect(schema.safeParse(oversizedDraft()).success).toBe(true);
  });

  it('clamps title, description and opening questions to the create contract', async () => {
    mockGenerateObject.mockResolvedValue({ object: oversizedDraft() });
    const spec = await draftAgentSpec([{ role: 'user', content: 'Pressestelle' }]);
    expect(spec.title.length).toBe(100);
    expect(spec.description.length).toBe(500);
    expect(spec.openingQuestions).toEqual(['1', '2', '3', '4']);
  });
});
