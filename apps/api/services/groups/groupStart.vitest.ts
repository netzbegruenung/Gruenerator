import { GROUP_START_QUESTIONS_MAX, GROUP_WELCOME_MAX } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryOne = vi.fn();
const checkMembership = vi.fn();

vi.mock('./groupMembership.js', () => ({
  getPostgresAndCheckMembership: (g: string, u: string, admin?: boolean) =>
    checkMembership(g, u, admin),
}));

const { getProjectStart, setProjectStart, normalizeProjectStart } = await import('./groupStart.js');

beforeEach(() => {
  queryOne.mockReset();
  checkMembership.mockReset().mockResolvedValue({ postgres: { queryOne } });
});

describe('normalizeProjectStart', () => {
  it('trims, drops empty questions and clamps to the contract limits', () => {
    const out = normalizeProjectStart({
      welcomeMessage: ` ${'x'.repeat(GROUP_WELCOME_MAX + 50)} `,
      startQuestions: [' A? ', '', '  ', 'B?', 'C?', 'D?', 'E?', 7],
    });
    expect(out.welcomeMessage).toHaveLength(GROUP_WELCOME_MAX);
    expect(out.startQuestions).toEqual(['A?', 'B?', 'C?', 'D?']);
    expect(out.startQuestions).toHaveLength(GROUP_START_QUESTIONS_MAX);
  });
});

describe('getProjectStart', () => {
  it('is open to members', async () => {
    queryOne.mockResolvedValue({ welcome_message: 'Hallo', start_questions: ['Was gibt es?'] });
    expect(await getProjectStart('g1', 'u1')).toEqual({
      welcomeMessage: 'Hallo',
      startQuestions: ['Was gibt es?'],
    });
    expect(checkMembership).toHaveBeenCalledWith('g1', 'u1', undefined);
  });

  it('answers empty when no row exists', async () => {
    queryOne.mockResolvedValue(null);
    expect(await getProjectStart('g1', 'u1')).toEqual({ welcomeMessage: '', startQuestions: [] });
  });
});

describe('setProjectStart', () => {
  it('requires a Projekt admin', async () => {
    checkMembership.mockRejectedValue(new Error('Keine Berechtigung für diese Aktion.'));
    await expect(
      setProjectStart('g1', 'u1', { welcomeMessage: 'x', startQuestions: [] })
    ).rejects.toThrow('Berechtigung');
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('upserts the normalized start as JSON', async () => {
    queryOne.mockResolvedValue({});
    const out = await setProjectStart('g1', 'u1', {
      welcomeMessage: ' Hi ',
      startQuestions: ['A?', ' '],
    });
    expect(checkMembership).toHaveBeenCalledWith('g1', 'u1', true);
    expect(queryOne.mock.calls[0]?.[1]).toEqual(['g1', 'Hi', '["A?"]']);
    expect(out).toEqual({ welcomeMessage: 'Hi', startQuestions: ['A?'] });
  });
});
