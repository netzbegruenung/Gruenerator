import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { CANVAS_HOST_COLLECTION_KEYS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { BALKEN_KIND } from './balkenKind';

/** Every kind registration the editor host hands to `registerElementKind`, by the name it is passed under. */
const REGISTERED_KINDS = { BALKEN_KIND } as const;

const SRC = join(__dirname, '..');

/** Source files under `dir`, tests excluded. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.vitest\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The identifiers passed to `registerElementKind(…)` in the editor host's source. */
function registeredIdentifiers(): string[] {
  return sources(SRC)
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\bregisterElementKind\(\s*([^)\s]+)\s*\)/g)].map(
        (m) => m[1]!
      )
    )
    .sort();
}

/**
 * The Hocuspocus service writes canvas Y.Docs without the editor and takes its host
 * collection keys from `@gruenerator/contracts` (`CANVAS_HOST_COLLECTION_KEYS`). A kind the
 * editor registers under a key that list lacks would be written by the server as one plain JSON
 * value, merged per key instead of per element.
 */
describe('host collection keys', () => {
  it('lists the stateKey of every kind the editor host registers', () => {
    for (const kind of Object.values(REGISTERED_KINDS)) {
      expect(CANVAS_HOST_COLLECTION_KEYS).toContain(kind.stateKey);
    }
  });

  it('registers exactly the kinds this test knows (a new kind goes into REGISTERED_KINDS and the list)', () => {
    expect(registeredIdentifiers()).toEqual(Object.keys(REGISTERED_KINDS).sort());
  });

  it('lists no key twice and no key without a kind', () => {
    const keys = Object.values(REGISTERED_KINDS).map((k) => k.stateKey);
    expect([...CANVAS_HOST_COLLECTION_KEYS].sort()).toEqual([...keys].sort());
  });
});
