/**
 * Guard: services/hocuspocus carries a copy of `SITE_ROLE_SQL` (no runtime dependency on apps/api).
 * Both must stay identical, whitespace aside.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function extract(file: string): string {
  const match = /export const SITE_ROLE_SQL = `([\s\S]*?)`;/.exec(readFileSync(file, 'utf8'));
  if (!match) throw new Error(`SITE_ROLE_SQL not found in ${file}`);
  return match[1].replace(/\s+/g, ' ').trim();
}

describe('SITE_ROLE_SQL copies', () => {
  it('API and Hocuspocus carry the same SQL', () => {
    const api = extract(resolve(here, 'siteRoleSql.ts'));
    const hocuspocus = extract(resolve(here, '../../../../services/hocuspocus/src/siteRoleSql.ts'));
    expect(api.length).toBeGreaterThan(200);
    expect(hocuspocus).toBe(api);
  });
});
