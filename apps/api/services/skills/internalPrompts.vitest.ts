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

const envMock = { INTERN_CONTENT_DIR: undefined as string | undefined };
vi.mock('../../config/env.js', () => ({ env: envMock }));

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
  envMock.INTERN_CONTENT_DIR = root;
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

describe('{{base:…}} composition', () => {
  it('substitutes a shared block from skills/_base', async () => {
    mkdirSync(join(root, 'skills', '_base'));
    writeFileSync(join(root, 'skills', '_base', 'pressemitteilung.md'), 'Rahmen um ein Zitat.\n');
    writeFileSync(
      join(root, 'skills', 'presse-hessen-fraktion.md'),
      'Hessen, 900 Zeichen.\n\n{{base:pressemitteilung}}\n\nUnterzeile setzen.\n'
    );
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('presse-hessen-fraktion')).toBe(
      'Hessen, 900 Zeichen.\n\nRahmen um ein Zitat.\n\nUnterzeile setzen.'
    );
  });

  it('drops the marker when the base block is missing, rather than shipping it', async () => {
    writeFileSync(
      join(root, 'skills', 'presse-hessen-fraktion.md'),
      'Hessen.\n\n{{base:fehlt}}\nRest.\n'
    );
    const { getInternalSkillPrompt } = await loadModule();

    expect(getInternalSkillPrompt('presse-hessen-fraktion')).toBe('Hessen.\n\nRest.');
  });

  it('does not offer base blocks as recipes of their own', async () => {
    mkdirSync(join(root, 'skills', '_base'));
    writeFileSync(join(root, 'skills', '_base', 'pressemitteilung.md'), 'Rahmen um ein Zitat.');
    writeFileSync(join(root, 'skills', 'presse.md'), 'Rezept.');
    const { getInternalSkillPrompt, getInternalPromptCount } = await loadModule();

    expect(getInternalPromptCount('skills')).toBe(1);
    expect(getInternalSkillPrompt('pressemitteilung')).toBeNull();
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
