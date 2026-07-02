/**
 * Verify all external packages imported by the compiled API are resolvable.
 * Run in the Docker production stage after `pnpm install` to catch
 * ERR_MODULE_NOT_FOUND before the container serves traffic.
 *
 * Catches two failure classes:
 *   1. Direct imports not declared in package.json (e.g. blurhash)
 *   2. Peer deps that are statically imported by installed packages
 *      (e.g. mem0ai/oss statically imports @anthropic-ai/sdk)
 *
 * Class 2 is caught because ESM resolves the full static import graph
 * of each module before executing any code — so import('mem0ai/oss')
 * throws ERR_MODULE_NOT_FOUND for @anthropic-ai/sdk before mem0ai runs.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '../dist');

const NODE_BUILTINS = new Set([
  'fs', 'path', 'url', 'os', 'http', 'https', 'crypto', 'stream', 'util',
  'zlib', 'child_process', 'worker_threads', 'cluster', 'dns', 'module',
  'buffer', 'events', 'net', 'tls', 'readline', 'assert', 'querystring',
]);

// Extract all unique import specifiers from compiled API dist files.
// Keeps full subpath specifiers (e.g. "mem0ai/oss") so transitive peer
// deps that live behind a subpath export are caught.
function extractSpecifiers() {
  const singleQuote = execSync(
    `grep -roh --include="*.js" "from '[^.'\"\\`][^']*'" "${distDir}" 2>/dev/null || true`,
    { encoding: 'utf8' }
  );
  const doubleQuote = execSync(
    `grep -roh --include="*.js" 'from "[^.\x27\x60"][^"]*"' "${distDir}" 2>/dev/null || true`,
    { encoding: 'utf8' }
  );

  const parse = (raw) =>
    raw
      .split('\n')
      .map((s) => s.replace(/^from ['"]/, '').replace(/['"]$/, '').trim())
      .filter(
        (s) =>
          s &&
          !s.startsWith('.') &&
          !s.startsWith('@gruenerator/') &&
          !s.startsWith('node:') &&
          !NODE_BUILTINS.has(s)
      );

  return new Set([...parse(singleQuote), ...parse(doubleQuote)]);
}

const specifiers = extractSpecifiers();
const list = [...specifiers].sort();

if (list.length === 0) {
  console.error('No import specifiers found — check distDir path:', distDir);
  process.exit(1);
}

console.log(`Checking ${list.length} external packages from dist/...`);

const results = await Promise.allSettled(list.map((s) => import(s)));

let failed = false;
for (let i = 0; i < list.length; i++) {
  const result = results[i];
  if (result.status === 'rejected') {
    const { code, message } = result.reason ?? {};
    if (code === 'ERR_MODULE_NOT_FOUND') {
      // First line has the actionable package name; rest is noise
      console.error(`✗ ${list[i]}: ${message.split('\n')[0]}`);
      failed = true;
    }
    // Other errors (missing env vars, unreachable DB, etc.) are
    // expected at build time — not a packaging problem.
  }
}

if (failed) {
  console.error('\nAdd the missing packages to apps/api/package.json dependencies.');
  process.exit(1);
}

console.log(`✓ All ${list.length} packages resolved.`);
