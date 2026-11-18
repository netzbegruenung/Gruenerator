/**
 * A public recipe whose private file is named differently loads without a body
 * and nothing fails (#5585). The load-time warning is the only guard, since CI
 * cannot see the private repo.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = { INTERN_CONTENT_DIR: undefined as string | undefined };
vi.mock('../../config/env.js', () => ({ env: envMock }));

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn() }),
}));

vi.mock('@gruenerator/shared/agents', () => ({
  SKILLS: [{ mention: 'antrag' }, { mention: 'instagram' }],
}));

let root: string;

beforeEach(() => {
  warn.mockClear();
  root = mkdtempSync(join(tmpdir(), 'intern-coverage-'));
  mkdirSync(join(root, 'skills'));
  envMock.INTERN_CONTENT_DIR = root;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function load() {
  vi.resetModules();
  const mod = await import('./internalPrompts.js');
  mod.getInternalSkillPrompt('instagram');
}

describe('recipes without an internal body', () => {
  it('warns with the mentions that have no file', async () => {
    writeFileSync(join(root, 'skills', 'kommunalantrag.md'), 'Text');
    writeFileSync(join(root, 'skills', 'instagram.md'), 'Hook');
    await load();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('antrag');
    expect(warn.mock.calls[0][0]).not.toContain('instagram');
  });

  it('stays quiet when every recipe has a body', async () => {
    writeFileSync(join(root, 'skills', 'antrag.md'), 'Text');
    writeFileSync(join(root, 'skills', 'instagram.md'), 'Hook');
    await load();

    expect(warn).not.toHaveBeenCalled();
  });
});
