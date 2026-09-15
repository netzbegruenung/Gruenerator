/**
 * Drift guard: every tool the agentic loop can MOUNT must have a UI entry.
 *
 * Why this exists: `packages/chat/src/lib/toolRegistry.vitest.ts` guards the
 * same invariant, but only for names reachable through `INTENT_TO_TOOL` /
 * `DEEP_TOOL_MAP` — the single-pass path. The loop catalog was never checked,
 * and 15 tools drifted out of the UI registry unnoticed. A tool without an
 * entry does not fail loudly: `getToolMeta` degrades to the RAW snake_case name
 * and `resolveToolEntry` to a `<dl>` dump of the model-facing payload, so
 * `rezept_laden` rendered as a grey pill literally labelled "rezept_laden".
 *
 * Why source text rather than imports: `apps/api` does not depend on
 * `@gruenerator/chat` (nor the reverse), and there is no path mapping. Importing
 * across the boundary would drag express + the DB layer into the test graph and
 * put files outside `rootDir` into tsc's view. Reading sibling source with
 * `node:fs` is the established idiom here — cf. `apps/api/routes.mountGuard.vitest.ts`
 * and `apps/mobile/services/apiBaseConvention.vitest.ts`.
 *
 * This guard lives in apps/api on purpose: a NEW tool is added here, so CI must
 * shout at the change site rather than two packages away.
 *
 * Out of scope by design: namespaced connector tools (`m<key>__<tool>`) are
 * generated at runtime and are covered by `resolveToolEntry`'s fallback plus
 * `formatNamespacedToolLabel`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoFile = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../../${rel}`, import.meta.url)), 'utf8');

/** Tool names the loop catalog can mount, gathered from all four mount sites. */
function loopToolNames(): ReadonlySet<string> {
  const names = new Set<string>();

  // `tools.<name> = ...` — the bulk of the catalog and the outer assembly.
  for (const rel of [
    'apps/api/routes/chat/agents/toolCatalog.ts',
    'apps/api/routes/chat/services/agenticLoop/catalogAssembly.ts',
  ]) {
    for (const m of repoFile(rel).matchAll(/\btools\.([a-z_][a-z0-9_]*)\s*=/g)) {
      names.add(m[1] as string);
    }
  }

  // `tools[ATTACHED_DOCS_TOOL] = ...` — the name lives in its own module.
  const attached = /ATTACHED_DOCS_TOOL\s*=\s*'([^']+)'/.exec(
    repoFile('apps/api/routes/chat/services/agenticLoop/attachedDocuments.ts')
  );
  if (attached?.[1]) names.add(attached[1]);

  // `tools[loopToolName] = ...` — one per artifact kind.
  for (const m of repoFile('apps/api/routes/chat/services/artifactKindRegistry.ts').matchAll(
    /loopToolName:\s*'([^']+)'/g
  )) {
    names.add(m[1] as string);
  }

  // `CATALOG_TOOLS` — the search family, mounted via `tools[name]`.
  const catalog = /const CATALOG_TOOLS = new Set\(\[([\s\S]*?)\]\)/.exec(
    repoFile('apps/api/routes/chat/agents/toolCatalog.ts')
  );
  for (const m of (catalog?.[1] ?? '').matchAll(/'([^']+)'/g)) names.add(m[1] as string);

  return names;
}

/** The `UI_TOOL_NAMES` zod enum in packages/chat. */
function uiToolNames(): readonly string[] {
  const block = /export const UI_TOOL_NAMES = z\.enum\(\[([\s\S]*?)\]\)/.exec(
    repoFile('packages/chat/src/lib/toolRegistry.ts')
  );
  if (!block?.[1]) throw new Error('UI_TOOL_NAMES enum not found — did toolRegistry.ts move?');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('loop catalog ↔ UI registry coverage', () => {
  // Positive controls FIRST. A regex that silently stops matching would make
  // the real assertion vacuously green — which is exactly how the original
  // drift survived a guard that was already in the repo.
  it('actually extracts the loop catalog', () => {
    const names = loopToolNames();
    expect(names.size).toBeGreaterThanOrEqual(30);
    // One per mount site, so a broken regex fails here and names the site.
    expect(names, 'tools.<name> site').toContain('rezept_laden');
    expect(names, 'artifactKindRegistry loopToolName site').toContain('create_pdf');
    expect(names, 'ATTACHED_DOCS_TOOL site').toContain('dokumente_lesen');
    expect(names, 'CATALOG_TOOLS site').toContain('web_search');
  });

  it('actually extracts the UI registry', () => {
    expect(uiToolNames().length).toBeGreaterThanOrEqual(40);
  });

  it('every mountable loop tool has a UI registry entry', () => {
    const ui = uiToolNames();
    const missing = [...loopToolNames()].filter((n) => !ui.includes(n)).sort();
    expect(
      missing,
      `Tools ohne UI-Eintrag — sie rendern sonst mit dem ROHEN Namen und einem ` +
        `key-value-Dump der modellseitigen Nutzlast. Nachtragen in ` +
        `packages/chat/src/lib/toolResults.ts (TOOL_METADATA) UND ` +
        `packages/chat/src/lib/toolRegistry.ts (UI_TOOL_NAMES + TOOL_REGISTRY).`
    ).toEqual([]);
  });
});
