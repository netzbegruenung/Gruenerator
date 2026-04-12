/**
 * generate-contracts-from-validate-body.ts
 *
 * Phase 4.x codegen helper — identifies all validateBody(someSchema) usages in
 * apps/api/routes/**\/*.ts and generates ts-rest contract stub skeletons for them.
 *
 * DOES NOT modify any files. Outputs a markdown report to stdout listing:
 *   - File path relative to repo root
 *   - HTTP method + route path
 *   - Zod schema reference
 *   - Generated contract stub
 *
 * Run with:
 *   npx tsx scripts/generate-contracts-from-validate-body.ts 2>&1 | tee /tmp/contracts-report.md
 *
 * Implementation note: uses simple regex parsing (no ts-morph AST traversal)
 * because the patterns are consistent and regex is fast + dependency-free.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RouteEntry {
  file: string;
  method: string;
  routePath: string;
  schemaRef: string;
  contractName: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROUTES_DIR = path.resolve(__dirname, '../apps/api/routes');
const REPO_ROOT = path.resolve(__dirname, '..');

function relPath(absPath: string): string {
  return path.relative(REPO_ROOT, absPath);
}

/**
 * Recursively collect all .ts files under a directory,
 * excluding .vitest.ts / .test.ts files.
 */
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.vitest.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Derive a camelCase contract key name from a route path and HTTP method.
 * e.g.  POST /send-content  → sendContent
 *       DELETE /bulk        → deleteBulk
 *       PATCH /:id/settings → patchSettingsById
 */
function deriveContractKey(method: string, routePath: string): string {
  const lowerMethod = method.toLowerCase();
  // Strip leading slash, replace param segments with "ById", split on /
  const segments = routePath
    .replace(/^\//, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) return 'By' + seg.slice(1).charAt(0).toUpperCase() + seg.slice(2);
      // kebab-case to camelCase
      return seg.replace(/-([a-z])/g, (_, c: string) => (c as string).toUpperCase());
    })
    .filter(Boolean);

  if (segments.length === 0) return lowerMethod + 'Root';

  const resource = segments
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join('');

  // For GET, omit method prefix (reads clean as "listThreads" / "getById")
  if (lowerMethod === 'get') return resource;
  return lowerMethod + resource.charAt(0).toUpperCase() + resource.slice(1);
}

/**
 * Parse a single route file and extract all validateBody usages.
 *
 * Patterns matched (all on a single source line after normalisation):
 *   router.post('/path', ..., validateBody(someSchema), ...)
 *   router.patch('/:id/sub', validateBody(someSchema), ...)
 *   router.delete('/bulk', validateBody(someSchema), ...)
 *   router.put('/thing', validateBody(someSchema), ...)
 *
 * Multi-line patterns (validateBody on a line that has no method call) are
 * matched by a two-pass heuristic: remember the last seen method+path line
 * within the same router block.
 */
function parseRouteFile(filePath: string): RouteEntry[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split('\n');
  const entries: RouteEntry[] = [];

  // Regex: router.<method>( ...  validateBody(schemaRef) ... ) — single-line
  const singleLineRe =
    /router\.(post|get|patch|put|delete)\s*\(\s*['"`]([^'"`]+)['"`][^)]*validateBody\((\w+)\)/i;

  // Regex: validateBody(schemaRef) alone (multi-line pattern — need context from above)
  const validateOnlyRe = /validateBody\((\w+)\)/;

  // Track last seen method/path in case validateBody is on a separate line
  let pendingMethod = '';
  let pendingPath = '';
  // Regex to capture just the method+path header
  const methodPathRe = /router\.(post|get|patch|put|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i;

  for (const line of lines) {
    // Single-line match: method + path + validateBody all on one line
    const single = singleLineRe.exec(line);
    if (single) {
      const [, method, routePath, schemaRef] = single;
      entries.push({
        file: relPath(filePath),
        method: method.toUpperCase(),
        routePath,
        schemaRef,
        contractName: deriveContractKey(method, routePath),
      });
      pendingMethod = '';
      pendingPath = '';
      continue;
    }

    // Update pending method/path whenever we see a new router call
    const mp = methodPathRe.exec(line);
    if (mp) {
      pendingMethod = mp[1].toUpperCase();
      pendingPath = mp[2];
    }

    // Multi-line: validateBody on its own line, use pending context
    const vo = validateOnlyRe.exec(line);
    if (vo && pendingMethod && pendingPath) {
      const schemaRef = vo[1];
      entries.push({
        file: relPath(filePath),
        method: pendingMethod,
        routePath: pendingPath,
        schemaRef,
        contractName: deriveContractKey(pendingMethod, pendingPath),
      });
      pendingMethod = '';
      pendingPath = '';
    }
  }

  return entries;
}

/**
 * Generate a ts-rest contract stub for a route entry.
 *
 * The stub uses `c.input` / `c.output` placeholders that reference the
 * original Zod schema name — the developer would import the schema and wire
 * the response schema manually.
 */
function generateContractStub(entry: RouteEntry): string {
  const { method, routePath, schemaRef, contractName } = entry;

  // Convert Express-style :param to ts-rest /:param notation (same format)
  const httpMethod = method.toLowerCase() as 'post' | 'get' | 'patch' | 'put' | 'delete';

  // Build body / query / pathParams blocks
  const hasBody = ['post', 'patch', 'put'].includes(httpMethod);
  const pathParams = (routePath.match(/:(\w+)/g) ?? []).map((p) => p.slice(1));

  const bodyLine = hasBody ? `\n    body: ${schemaRef},` : '';
  const pathParamsLine =
    pathParams.length > 0
      ? `\n    pathParams: z.object({ ${pathParams.map((p) => `${p}: z.string()`).join(', ')} }),`
      : '';

  return `  ${contractName}: {
    method: '${method}',
    path: '${routePath}',${pathParamsLine}${bodyLine}
    responses: {
      200: z.object({ success: z.literal(true) /* TODO: add response schema */ }),
      400: z.object({ error: z.string() }),
      500: z.object({ error: z.string() }),
    },
  },`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main(): void {
  const files = collectTsFiles(ROUTES_DIR);
  const allEntries: RouteEntry[] = [];

  for (const file of files) {
    const entries = parseRouteFile(file);
    allEntries.push(...entries);
  }

  // Group by file for the report
  const byFile = new Map<string, RouteEntry[]>();
  for (const entry of allEntries) {
    const list = byFile.get(entry.file) ?? [];
    list.push(entry);
    byFile.set(entry.file, list);
  }

  const totalRoutes = allEntries.length;
  const totalFiles = byFile.size;

  // ── Report ──────────────────────────────────────────────────────────────────

  console.log('# ts-rest Contract Migration Report');
  console.log('');
  console.log(
    `Found **${totalRoutes} validateBody routes** across **${totalFiles} files** that could be migrated to ts-rest contracts.`
  );
  console.log('');
  console.log(
    '> **Methodology**: regex scan of `router.<method>(path, ..., validateBody(schema), ...)` patterns.'
  );
  console.log('> Multi-line patterns are captured via a two-pass heuristic.');
  console.log('');
  console.log('---');
  console.log('');

  for (const [file, entries] of byFile) {
    console.log(`## \`${file}\``);
    console.log('');
    console.log(`${entries.length} route(s) identified`);
    console.log('');

    // Summary table
    console.log('| Method | Path | Schema | Contract key |');
    console.log('|--------|------|--------|--------------|');
    for (const e of entries) {
      console.log(`| \`${e.method}\` | \`${e.routePath}\` | \`${e.schemaRef}\` | \`${e.contractName}\` |`);
    }

    console.log('');
    console.log('**Skeleton contract stubs:**');
    console.log('');
    console.log('```typescript');
    console.log(
      `// Add this to packages/contracts/src/<domain>Contract.ts\n// (import your Zod schemas and z from zod)\n`
    );
    for (const e of entries) {
      console.log(generateContractStub(e));
      console.log('');
    }
    console.log('```');
    console.log('');
  }

  // ── Priority recommendations ─────────────────────────────────────────────────

  console.log('---');
  console.log('');
  console.log('## Recommended migration order (highest impact first)');
  console.log('');

  const priorityFiles = [
    'apps/api/routes/chat/threadsController.ts',
    'apps/api/routes/chat/chatGraphController.ts',
    'apps/api/routes/docs/documentController.ts',
    'apps/api/routes/boards/boardsController.ts',
    'apps/api/routes/share/shareController.ts',
    'apps/api/routes/auth/userProfile.ts',
  ];

  let rank = 1;
  for (const pf of priorityFiles) {
    const entries = byFile.get(pf);
    if (entries) {
      console.log(
        `${rank}. **\`${pf}\`** — ${entries.length} route(s): ${entries.map((e) => `\`${e.method} ${e.routePath}\``).join(', ')}`
      );
      rank++;
    }
  }

  console.log('');
  console.log(
    '> Next step: pick a priority file, add the stubs to `packages/contracts/src/`, implement the backend router in `routes/<domain>/...ContractRouter.ts`, and migrate the frontend hook.'
  );
}

main();
