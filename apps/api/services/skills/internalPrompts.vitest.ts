/**
 * The loader is what keeps party-internal prompt text out of a public repo and
 * out of every shipped bundle, so the cases that matter are the ones where it
 * quietly does the wrong thing.
 *
 * The missing-directory case carries the weight: a failed rollout must degrade
 * rather than throw and take the chat down with it. It is also the case a
 * developer with a populated `.external/` checkout never hits locally — which is
 * exactly why it is tested rather than assumed.
 *
 * Skills and agents are separate caches over separate subdirectories; a lookup
 * must not cross over, or a rolled-out recipe would mask a missing persona.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = {
  INTERN_CONTENT_DIR: undefined as string | undefined,
  NODE_ENV: 'test' as string,
};
vi.mock('../../config/env.js', () => ({ env: envMock }));

const logSpy = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('../../utils/logger.js', () => ({ createLogger: () => logSpy }));

let root: string;

/** Fresh module per case — the loader caches after its first read, by design. */
async function loadModule() {
  vi.resetModules();
  return import('./internalPrompts.js');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'intern-content-'));
  mkdirSync(join(root, 'skills'));
  mkdirSync(join(root, 'agents'));
  mkdirSync(join(root, 'rollen'));
  envMock.INTERN_CONTENT_DIR = root;
  envMock.NODE_ENV = 'test';
  logSpy.info.mockClear();
  logSpy.warn.mockClear();
  logSpy.error.mockClear();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('getInternalSkillPrompt', () => {
  it('returns the body of a mention, keyed by filename', async () => {
    writeFileSync(join(root, 'skills', 'presse-berlin.md'), 'Zitatanteil 75,6 %.\n');
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('presse-berlin')).toBe('Zitatanteil 75,6 %.');
  });

  it('returns null for a mention with no internal file', async () => {
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('presse-berlin')).toBeNull();
  });

  it('strips a frontmatter block if one was left in the private file', async () => {
    writeFileSync(join(root, 'skills', 'instagram.md'), '---\nmention: instagram\n---\n\nHook.\n');
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('instagram')).toBe('Hook.');
  });

  it('ignores an empty file rather than injecting a blank prompt block', async () => {
    writeFileSync(join(root, 'skills', 'reel.md'), '\n  \n');
    const { getInternalSkillPrompt, getInternalPromptCount } = await loadModule();

    expect(getInternalSkillPrompt('reel')).toBeNull();
    expect(getInternalPromptCount('skills')).toBe(0);
  });

  it('skips non-markdown files', async () => {
    writeFileSync(join(root, 'skills', 'README.txt'), 'nicht laden');
    writeFileSync(join(root, 'skills', 'twitter.md'), '280 Zeichen.');
    const { getInternalPromptCount } = await loadModule();

    expect(getInternalPromptCount('skills')).toBe(1);
  });
});

describe('getInternalAgentPrompt', () => {
  it('returns the persona of an agent, keyed by identifier', async () => {
    writeFileSync(join(root, 'agents', 'gruenerator-antrag.md'), 'Du bist Antragsprofi.\n');
    const { getInternalAgentPrompt } = await loadModule();

    expect(getInternalAgentPrompt('gruenerator-antrag')).toBe('Du bist Antragsprofi.');
  });

  it('does not fall through to the skills directory', async () => {
    writeFileSync(join(root, 'skills', 'presse.md'), 'Rezept-Text.');
    const { getInternalAgentPrompt } = await loadModule();

    expect(getInternalAgentPrompt('presse')).toBeNull();
  });
});

/**
 * The boot report exists because the loader's own warning is lazy — it fires on
 * the first turn that needs a prompt, long after the deploy that broke it. What
 * these cases guard is therefore not the wording but the level: an empty
 * inventory in production has to be loud enough to stop a deploy, while a fork
 * with no private checkout must still boot without a red log.
 */
describe('reportInternalPromptInventory', () => {
  it('reports one line with all three counts when everything is rolled out', async () => {
    writeFileSync(join(root, 'skills', 'instagram.md'), 'Hook.');
    writeFileSync(join(root, 'agents', 'gruenerator-antrag.md'), 'Persona.');
    writeFileSync(join(root, 'rollen', 'mdb-buero.md'), 'Auftrag.');
    const { reportInternalPromptInventory } = await loadModule();

    reportInternalPromptInventory();

    expect(logSpy.warn).not.toHaveBeenCalled();
    expect(logSpy.error).not.toHaveBeenCalled();
    expect(logSpy.info).toHaveBeenCalledWith(expect.stringContaining('skills=1 agents=1 rollen=1'));
  });

  it('names the kinds that are empty rather than reporting a bare total', async () => {
    writeFileSync(join(root, 'skills', 'instagram.md'), 'Hook.');
    const { reportInternalPromptInventory } = await loadModule();

    reportInternalPromptInventory();

    const message = logSpy.warn.mock.calls[0]?.[0] as string;
    expect(message).toContain('agents, rollen');
    expect(message).not.toContain('skills,');
  });

  it('escalates to error in production — an empty rollout there is a broken deploy', async () => {
    envMock.NODE_ENV = 'production';
    const { reportInternalPromptInventory } = await loadModule();

    reportInternalPromptInventory();

    expect(logSpy.error).toHaveBeenCalledWith(expect.stringContaining('skills, agents, rollen'));
    expect(logSpy.warn).not.toHaveBeenCalled();
  });

  it('stays a warning outside production, so a fork without the checkout still boots', async () => {
    envMock.INTERN_CONTENT_DIR = undefined;
    const { reportInternalPromptInventory } = await loadModule();

    reportInternalPromptInventory();

    expect(logSpy.error).not.toHaveBeenCalled();
    expect(logSpy.warn).toHaveBeenCalledWith(expect.stringContaining('INTERN_CONTENT_DIR unset'));
  });
});

describe('a rollout that never landed', () => {
  it('degrades to null instead of throwing, for both kinds', async () => {
    envMock.INTERN_CONTENT_DIR = join(root, 'does-not-exist');
    const { getInternalSkillPrompt, getInternalAgentPrompt, getInternalPromptCount } =
      await loadModule();

    expect(getInternalSkillPrompt('instagram')).toBeNull();
    expect(getInternalAgentPrompt('gruenerator-antrag')).toBeNull();
    expect(getInternalPromptCount('skills')).toBe(0);
    expect(getInternalPromptCount('agents')).toBe(0);
  });
});
