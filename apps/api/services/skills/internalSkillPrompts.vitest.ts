/**
 * The loader is what keeps party-internal prompt text out of a public repo and
 * out of every shipped bundle, so the cases that matter are the ones where it
 * quietly does the wrong thing.
 *
 * The missing-directory case carries the weight: a failed rollout must degrade
 * to "no prompt" and let the turn run on the agent's base systemRole, never
 * throw and take the chat down with it. It is also the case a developer with a
 * populated `.external/` checkout never hits locally — which is exactly why it
 * is tested rather than assumed.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = { SKILLS_INTERN_DIR: undefined as string | undefined };
vi.mock('../../config/env.js', () => ({ env: envMock }));

let dir: string;

/** Fresh module per case — the loader caches after its first read, by design. */
async function loadModule() {
  vi.resetModules();
  return import('./internalSkillPrompts.js');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'skills-intern-'));
  envMock.SKILLS_INTERN_DIR = dir;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('getInternalSkillPrompt', () => {
  it('returns the body of a mention, keyed by filename', async () => {
    writeFileSync(join(dir, 'presse-berlin.md'), 'Zitatanteil 75,6 %.\n');
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('presse-berlin')).toBe('Zitatanteil 75,6 %.');
  });

  it('returns null for a mention with no internal file', async () => {
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('presse-berlin')).toBeNull();
  });

  it('degrades to null instead of throwing when the directory was never rolled out', async () => {
    envMock.SKILLS_INTERN_DIR = join(dir, 'does-not-exist');
    const { getInternalSkillPrompt, getInternalSkillPromptCount } = await loadModule();

    expect(getInternalSkillPrompt('instagram')).toBeNull();
    expect(getInternalSkillPromptCount()).toBe(0);
  });

  it('strips a frontmatter block if one was left in the private file', async () => {
    writeFileSync(join(dir, 'instagram.md'), '---\nmention: instagram\n---\n\nHook zuerst.\n');
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('instagram')).toBe('Hook zuerst.');
  });

  it('ignores an empty file rather than injecting a blank prompt block', async () => {
    writeFileSync(join(dir, 'reel.md'), '\n  \n');
    const { getInternalSkillPrompt, getInternalSkillPromptCount } = await loadModule();

    expect(getInternalSkillPrompt('reel')).toBeNull();
    expect(getInternalSkillPromptCount()).toBe(0);
  });

  it('skips non-markdown files', async () => {
    writeFileSync(join(dir, 'README.txt'), 'nicht laden');
    writeFileSync(join(dir, 'twitter.md'), '280 Zeichen.');
    const { getInternalSkillPromptCount } = await loadModule();

    expect(getInternalSkillPromptCount()).toBe(1);
  });
});
