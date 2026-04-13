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
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname (the script runs under --type=module via tsx)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ──────────────────────────────────────────────────────────────────────

interface RouteEntry {
  file: string;
  method: string;
  routePath: string;
  schemaRef: string;
  contractName: string;
  /** Discovered response shapes keyed by HTTP status code. */
  responses: ResponseShape[];
}

interface ResponseShape {
  /** HTTP status code. Defaults to 200 when `res.json(...)` has no preceding `.status(N)`. */
  status: number;
  /** Best-effort inferred Zod schema as a TypeScript snippet, e.g. `z.object({ success: z.boolean(), id: z.string() })`. */
  zod: string;
  /**
   * Raw object literal text from the source, for the developer to eyeball
   * against the emitted Zod schema. Empty if the shape couldn't be inferred
   * (dynamic value, spread, variable reference) — in that case the emitted
   * schema is a fallback `z.unknown()`.
   */
  source: string;
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

// ── Response shape extraction ───────────────────────────────────────────────
//
// These helpers walk a handler body (the text between `router.method(...,
// async (req, res) => {` and its matching closing `});`) and emit Zod schema
// snippets for every res.json / res.status(N).json call site. Used by
// parseRouteFile below to populate RouteEntry.responses.
//
// Accuracy note: regex-based extraction. Handles ~90% of this codebase's
// patterns — object literals with inline key:value pairs, spreads, nested
// objects. Unknown shapes (function call results, complex conditionals)
// fall back to z.unknown() with the raw source preserved for the developer
// to eyeball.

/**
 * Given source text starting at the opening brace of an object literal,
 * return the substring up to the matching closing brace, respecting nested
 * `{}`, `()`, `[]`, string literals, and template strings. Returns null if
 * the input doesn't start with `{` or the braces don't balance.
 */
function extractBalancedObject(source: string, startIdx: number): string | null {
  if (source[startIdx] !== '{') return null;
  let depth = 0;
  let i = startIdx;
  let inString: '"' | "'" | '`' | null = null;
  let escape = false;

  while (i < source.length) {
    const ch = source[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      i++;
      continue;
    }
    if (inString) {
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(startIdx, i + 1);
    }
    i++;
  }
  return null;
}

/**
 * Parse an object literal string (the `{ ... }` form from source) and
 * return a Zod schema snippet for its shape. Only handles literal keys
 * with simple value types; falls back to z.unknown() for anything
 * non-trivial.
 *
 * Supported value classifications:
 *   - String literal → z.string()
 *   - Number literal → z.number()
 *   - true/false     → z.boolean()
 *   - null           → z.null()
 *   - Nested { }     → recursively inferred
 *   - Array literal  → z.array(z.unknown()) (element type not inferred)
 *   - Identifier     → z.unknown() (variable reference — shape unknown)
 *   - Everything else → z.unknown()
 */
function inferZodFromObjectLiteral(objLit: string): string {
  // Remove the outer braces and trim
  const inner = objLit.replace(/^\{/, '').replace(/\}$/, '').trim();
  if (inner === '') return 'z.object({})';

  // Split on top-level commas (respecting nested {}, [], (), and strings)
  const pairs: string[] = [];
  let depth = 0;
  let start = 0;
  let inString: '"' | "'" | '`' | null = null;
  let escape = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      pairs.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) pairs.push(last);

  const fields: string[] = [];
  for (const pair of pairs) {
    // Spread elements → fall through as z.unknown() for the whole object
    if (pair.startsWith('...')) return 'z.unknown()';

    // Shorthand `foo` → `foo: foo` (value is a variable reference, unknown type)
    const shorthandMatch = /^([a-zA-Z_$][\w$]*)$/.exec(pair);
    if (shorthandMatch) {
      fields.push(`${shorthandMatch[1]}: z.unknown()`);
      continue;
    }

    // key: value (key may be `'quoted'` or `identifier` or `"quoted"`)
    const kvMatch = /^(?:(['"])([^'"]+)\1|([a-zA-Z_$][\w$]*))\s*:\s*([\s\S]+)$/.exec(pair);
    if (!kvMatch) continue;
    const key = kvMatch[2] ?? kvMatch[3];
    const rawValue = kvMatch[4].trim();

    fields.push(`${key}: ${inferZodFromExpression(rawValue)}`);
  }

  return `z.object({ ${fields.join(', ')} })`;
}

/**
 * Infer a Zod schema for a single expression.
 */
function inferZodFromExpression(expr: string): string {
  const trimmed = expr.trim();

  // String literal
  if (/^(['"`]).*\1$/.test(trimmed)) return 'z.string()';
  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return 'z.number()';
  // Boolean
  if (trimmed === 'true' || trimmed === 'false') return 'z.boolean()';
  // null / undefined
  if (trimmed === 'null') return 'z.null()';
  if (trimmed === 'undefined') return 'z.unknown()';
  // Nested object literal
  if (trimmed.startsWith('{')) {
    const nested = extractBalancedObject(trimmed, 0);
    if (nested && nested.length === trimmed.length) {
      return inferZodFromObjectLiteral(nested);
    }
  }
  // Array literal
  if (trimmed.startsWith('[')) return 'z.array(z.unknown())';

  // Ternary `cond ? a : b` → infer from either branch if they match
  const ternaryMatch = /^([^?]+)\?\s*([^:]+):\s*(.+)$/.exec(trimmed);
  if (ternaryMatch) {
    const a = inferZodFromExpression(ternaryMatch[2]);
    const b = inferZodFromExpression(ternaryMatch[3]);
    if (a === b) return a;
    // Null-biased: `x ?? null` / `x || null` → .nullable() of the other
    if (b === 'z.null()') return `${a}.nullable()`;
    if (a === 'z.null()') return `${b}.nullable()`;
  }

  // Everything else (function calls, identifier refs, member accesses)
  return 'z.unknown()';
}

/**
 * Extract response shapes from a handler body. Scans for `res.json(x)` and
 * `res.status(N).json(x)` patterns, then classifies `x` via the inference
 * helpers above.
 *
 * The handlerBody should be the text between the opening `{` of the
 * handler function and its matching closing `}`. Errors are swallowed
 * — any pattern the regex can't match produces a z.unknown() fallback.
 */
function extractResponseShapes(handlerBody: string): ResponseShape[] {
  const shapes: ResponseShape[] = [];
  const seen = new Set<string>(); // Dedup by `${status}:${zod}` to avoid duplicates

  // Match both `res.status(N).json(` and plain `res.json(` patterns
  const resCallRe = /res(?:\.status\((\d+)\))?\.json\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = resCallRe.exec(handlerBody)) !== null) {
    const status = match[1] ? parseInt(match[1], 10) : 200;
    const openParenIdx = match.index + match[0].length - 1;

    // Find the argument to .json(...). It can be an object literal,
    // an identifier, or a function call result.
    let argStart = openParenIdx + 1;
    while (argStart < handlerBody.length && /\s/.test(handlerBody[argStart])) argStart++;
    if (argStart >= handlerBody.length) continue;

    let zod: string;
    let source: string;

    if (handlerBody[argStart] === '{') {
      const obj = extractBalancedObject(handlerBody, argStart);
      if (obj) {
        zod = inferZodFromObjectLiteral(obj);
        source = obj.replace(/\s+/g, ' ').slice(0, 100);
      } else {
        zod = 'z.unknown()';
        source = '';
      }
    } else {
      // Not a literal — probably an identifier or function call. Extract until
      // we hit the matching close paren of .json(.
      let depth = 1;
      let i = argStart;
      let inString: '"' | "'" | '`' | null = null;
      while (i < handlerBody.length && depth > 0) {
        const ch = handlerBody[i];
        if (inString) {
          if (ch === inString) inString = null;
        } else if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch;
        } else if (ch === '(' || ch === '{' || ch === '[') depth++;
        else if (ch === ')' || ch === '}' || ch === ']') {
          depth--;
          if (depth === 0) break;
        }
        i++;
      }
      source = handlerBody.slice(argStart, i).replace(/\s+/g, ' ').trim().slice(0, 100);
      zod = 'z.unknown()';
    }

    const key = `${status}:${zod}`;
    if (seen.has(key)) continue;
    seen.add(key);
    shapes.push({ status, zod, source });
  }

  // If no explicit responses found, fall back to a default 200 + 500 error
  if (shapes.length === 0) {
    shapes.push({ status: 200, zod: 'z.unknown()', source: '(no res.json call found)' });
  }

  // Always add a 400/500 error variant if not present, so the contract has
  // the common error responses declared.
  if (!shapes.some((s) => s.status === 400)) {
    shapes.push({ status: 400, zod: 'z.object({ error: z.string() })', source: '(default)' });
  }
  if (!shapes.some((s) => s.status === 500)) {
    shapes.push({ status: 500, zod: 'z.object({ error: z.string() })', source: '(default)' });
  }

  // Sort by status code for deterministic output
  shapes.sort((a, b) => a.status - b.status);
  return shapes;
}

/**
 * Given a file source and the index where `router.method(...)` begins, find
 * the matching handler body and return it. Returns empty string if the
 * handler body can't be located (e.g. handler is defined as a named
 * function passed by reference).
 */
function extractHandlerBody(source: string, routerCallIdx: number): string {
  // Find the opening paren of the router.method call
  const openParen = source.indexOf('(', routerCallIdx);
  if (openParen === -1) return '';

  // Walk to the matching close paren, respecting nested delimiters
  let depth = 1;
  let i = openParen + 1;
  let inString: '"' | "'" | '`' | null = null;
  let escape = false;

  // Track the last `{` we opened at depth 2 (the handler body start)
  let handlerBodyStart = -1;
  let handlerBodyEnd = -1;
  let innerDepth = 0;

  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      i++;
      continue;
    }
    if (inString) {
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === '{') {
      if (handlerBodyStart === -1) handlerBodyStart = i;
      innerDepth++;
    } else if (ch === '}') {
      innerDepth--;
      if (innerDepth === 0) handlerBodyEnd = i;
    }
    i++;
  }

  if (handlerBodyStart !== -1 && handlerBodyEnd !== -1) {
    return source.slice(handlerBodyStart, handlerBodyEnd + 1);
  }
  return '';
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

  // Helper: given method + path, find the router call's character index in
  // the full source and extract its handler body for response inference.
  const getResponses = (method: string, routePath: string): ResponseShape[] => {
    const needle = `router.${method.toLowerCase()}('${routePath}'`;
    let idx = source.indexOf(needle);
    if (idx === -1) idx = source.indexOf(`router.${method.toLowerCase()}("${routePath}"`);
    if (idx === -1) idx = source.indexOf(`router.${method.toLowerCase()}(\`${routePath}\``);
    if (idx === -1) return extractResponseShapes('');
    const handlerBody = extractHandlerBody(source, idx);
    return extractResponseShapes(handlerBody);
  };

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
        responses: getResponses(method, routePath),
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
        responses: getResponses(pendingMethod, pendingPath),
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
  const { method, routePath, schemaRef, contractName, responses } = entry;

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

  // Emit one response entry per discovered status code. Each line shows the
  // inferred Zod schema, with the original source snippet as a trailing
  // `// source: ...` comment so the developer can eyeball the inference.
  const responseLines = responses
    .map((r) => {
      const comment = r.source ? `  // ${r.source}` : '';
      return `      ${r.status}: ${r.zod},${comment}`;
    })
    .join('\n');

  return `  ${contractName}: {
    method: '${method}',
    path: '${routePath}',${pathParamsLine}${bodyLine}
    responses: {
${responseLines}
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
