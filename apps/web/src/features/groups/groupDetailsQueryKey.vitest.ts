/**
 * Drift guard: `['groupDetails', id]` is one cache entry, so it may have only
 * ONE shape.
 *
 * `GroupDetailSection` used to run its own `useQuery` on that key returning
 * `{ groupInfo, isAdmin, membership, joinToken }`, while `useGroupDetails`
 * (packages/shared) returns `{ group, membership }`. Both are internally
 * consistent, so tsc, lint and every component test stay green — but they share
 * one QueryClient in the browser bundle, so whichever fetched last owns the
 * entry. Visiting a Projekt and then `/chat?projekt=<id>` handed ChatPage the
 * foreign shape, and `projektDetails.group.name` threw
 * `TypeError: can't access property "name", …group is undefined` in production.
 *
 * Nothing in the type system can see this: the collision is between two
 * independent call sites, not inside either one. Hence a source-text guard —
 * the established idiom here, cf. `packages/chat/src/barrelParity.vitest.ts`.
 *
 * Scope is the three source trees that ship in the web bundle and therefore
 * share one QueryClient. `apps/mobile` has its own client and is unaffected.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** The single hook allowed to define what the `groupDetails` entry holds. */
const KEY_OWNER = 'packages/shared/src/groups/useGroups.ts';

const SOURCE_ROOTS = ['apps/web/src', 'packages/shared/src', 'packages/chat/src'];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(REPO_ROOT, root))).map((path) => ({
  path: relative(REPO_ROOT, path),
  source: readFileSync(path, 'utf8'),
}));

/** Slice out each `useQuery(...)` call by matching its parentheses. */
function useQueryCallSites(source: string): string[] {
  const sites: string[] = [];
  const opener = /\buseQuery\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')' && --depth === 0) break;
    }
    sites.push(source.slice(match.index, i + 1));
  }
  return sites;
}

describe('groupDetails query key', () => {
  it('is fetched by exactly one hook', () => {
    const fetchers = FILES.filter(({ source }) =>
      useQueryCallSites(source).some((site) => site.includes('groupDetails'))
    ).map(({ path }) => path);

    expect(fetchers).toEqual([KEY_OWNER]);
  });

  it('is never written under a second shape', () => {
    const writers = FILES.filter(
      ({ path, source }) =>
        path !== KEY_OWNER &&
        /setQueryData\(\s*(groupDetailsKey\(|\[\s*['"`]groupDetails)/.test(source)
    ).map(({ path }) => path);

    expect(writers).toEqual([]);
  });

  it('is built through the key factory, never spelled out inline', () => {
    const inlined = FILES.filter(
      ({ path, source }) =>
        !path.endsWith('groups/types.ts') &&
        !path.endsWith('groupDetailsQueryKey.vitest.ts') &&
        /['"`]groupDetails['"`]/.test(source)
    ).map(({ path }) => path);

    expect(inlined).toEqual([]);
  });
});
