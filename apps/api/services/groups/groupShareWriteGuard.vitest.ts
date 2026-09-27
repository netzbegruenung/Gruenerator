/**
 * Every path that writes into `group_content_shares` must go through
 * `assertCanShareToGroup` — otherwise any member could post into the system
 * group, which every user belongs to. The share inserts are spread over many
 * routers, so a new one slipping past the gate is the likely regression.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Derived shares: copies rows of an existing share, no group chosen by the user.
const EXEMPT = new Set(['services/boards/boardSharingService.ts']);

function shareWriters(): string[] {
  return readdirSync(API_ROOT, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.vitest.ts'))
    .filter((f) => !f.split('/').some((seg) => seg === 'node_modules' || seg === 'dist'))
    .filter((f) => /INSERT INTO group_content_shares/.test(readFileSync(join(API_ROOT, f), 'utf8')))
    .map((f) => relative(API_ROOT, join(API_ROOT, f)));
}

describe('group share write guard', () => {
  it('finds the share writers at all', () => {
    expect(shareWriters().length).toBeGreaterThan(5);
  });

  it('gates every share INSERT through assertCanShareToGroup', () => {
    const ungated = shareWriters().filter(
      (f) =>
        !EXEMPT.has(f) && !readFileSync(join(API_ROOT, f), 'utf8').includes('assertCanShareToGroup')
    );
    expect(ungated).toEqual([]);
  });
});
