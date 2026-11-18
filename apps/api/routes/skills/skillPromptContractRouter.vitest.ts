/**
 * `GET /api/skills/:mention/prompt`: nur Erwähnungen des öffentlichen Katalogs
 * sind beantwortbar, und ein Rezept ohne Rumpf im internen Repo ist kein Fehler,
 * sondern `prompt: null` — die Oberfläche fällt dann auf die Beschreibung zurück.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInternalSkillPrompt = vi.hoisted(() => vi.fn());

vi.mock('../../services/skills/internalPrompts.js', () => ({ getInternalSkillPrompt }));

const { skillPromptContractRouter } = await import('./skillPromptContractRouter.js');

const call = (mention: string) =>
  skillPromptContractRouter.getPrompt({ params: { mention } } as never);

beforeEach(() => {
  getInternalSkillPrompt.mockReset();
});

describe('skillPromptContract.getPrompt', () => {
  it('answers a known mention with its prompt', async () => {
    getInternalSkillPrompt.mockReturnValue('Schreibe eine Pressemitteilung.');

    const res = await call('presse');

    expect(res).toEqual({
      status: 200,
      body: { mention: 'presse', prompt: 'Schreibe eine Pressemitteilung.' },
    });
  });

  it('answers an unknown mention with 404 and never reads a file', async () => {
    const res = await call('../../etc/passwd');

    expect(res.status).toBe(404);
    expect(getInternalSkillPrompt).not.toHaveBeenCalled();
  });

  it('answers 200 with prompt null when the internal repo has no body', async () => {
    getInternalSkillPrompt.mockReturnValue(null);

    const res = await call('presse');

    expect(res).toEqual({ status: 200, body: { mention: 'presse', prompt: null } });
  });
});
