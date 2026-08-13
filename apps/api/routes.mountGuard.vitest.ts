import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Two mount-order invariants that no type check can see, both of which have
 * already failed in production once:
 *
 *  1. `/api/internal` must be gated on the PREFIX, before any internal route
 *     registers. Gating per sub-router looks equivalent and is not: every
 *     router added later inherits "open" as its default, which is how
 *     route-stats and gruene-api ended up answering anonymous callers while
 *     their siblings required an admin token.
 *  2. A guard added AFTER a ts-rest mount never runs for that contract's
 *     routes — createExpressEndpoints registers handlers directly on `app`
 *     with absolute paths, bypassing later prefix middleware. That is what
 *     once left /api/exports open, and the same shape gates image-picker and
 *     unsplash today.
 *
 * The check reads the source rather than booting the app: it is the mount
 * ORDER that carries the guarantee, and order is what a diff silently changes.
 */
const routesSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'routes.ts'),
  'utf8'
);

const firstIndexOf = (needle: string): number => routesSource.indexOf(needle);

/** Escapes every regex metacharacter, backslash first — a partial escape is
 *  the classic `js/incomplete-sanitization` finding. */
const escapeRegExp = (value: string): string => value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

describe('routes.ts mount order', () => {
  it('gates the whole /api/internal prefix before any internal route registers', () => {
    const gate = firstIndexOf("app.use('/api/internal', requireAdminToken)");
    expect(gate).toBeGreaterThan(-1);

    const otherInternalMounts = [...routesSource.matchAll(/app\.use\('\/api\/internal[^']*'/g)]
      .map((m) => m.index ?? -1)
      .filter((i) => i !== gate);

    for (const index of otherInternalMounts) {
      expect(index).toBeGreaterThan(gate);
    }
  });

  it('gates /api/database with the admin token', () => {
    expect(routesSource).toContain("app.use('/api/database', requireAdminToken");
  });

  it('gates contract-router prefixes before their mount call', () => {
    const cases = [
      { prefix: '/api/image-picker', mount: 'mountImagePickerContractRouter(app)' },
      { prefix: '/api/unsplash', mount: 'mountUnsplashContractRouter(app)' },
      { prefix: '/api/exports', mount: 'mountExportsContractRouter(app)' },
      { prefix: '/api/sharepic/text', mount: 'mountSharepicTextContractRouter(app)' },
    ];

    for (const { prefix, mount } of cases) {
      // `requireAuth` need not be the FIRST middleware — /api/sharepic/text
      // puts `aiGenerationLimiter` in front of it — only in the same call.
      const guard = routesSource.search(
        new RegExp(`app\\.use\\('${escapeRegExp(prefix)}',[^)]*requireAuth`)
      );
      const mountCall = firstIndexOf(mount);

      expect(guard, `${prefix} has no requireAuth on its prefix`).toBeGreaterThan(-1);
      expect(mountCall).toBeGreaterThan(-1);
      expect(guard, `${prefix} guard must precede ${mount}`).toBeLessThan(mountCall);
    }
  });
});
