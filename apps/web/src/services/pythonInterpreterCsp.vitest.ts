/**
 * The Pyodide worker runs model-written Python in the app's origin. What keeps
 * that code off /api (session cookie) and away from third parties is the
 * Content-Security-Policy nginx sends with the worker script — a dedicated
 * worker enforces the policy of its own response. That header hangs on a
 * regex over the built file name, so a renamed worker or a loosened policy
 * would drop the sandbox without anything else failing. This test reads the
 * nginx config in apps/web/Dockerfile and pins both.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(import.meta.dirname, '../..');
const dockerfile = readFileSync(path.join(WEB_ROOT, 'Dockerfile'), 'utf8');
const interpreterSource = readFileSync(
  path.join(WEB_ROOT, 'src/services/pythonInterpreter.ts'),
  'utf8'
);

// Vite names a worker chunk `assets/<entry file name without .ts>-<hash>.js`
// (a build on 22.10.2026 emitted assets/pythonInterpreter.worker-<hash>.js).
const workerEntry = /new Worker\(new URL\('\.\/([\w.]+)\.ts', import\.meta\.url\)/.exec(
  interpreterSource
)?.[1];
const builtWorkerPath = `/assets/${workerEntry ?? '<missing>'}-DRJ9tB4d.js`;

function regexLocations(config: string): Array<{ pattern: RegExp; body: string }> {
  return [...config.matchAll(/location ~ (\S+) \{([^}]*)\}/g)].map((m) => ({
    pattern: new RegExp(m[1]),
    body: m[2],
  }));
}

const workerLocation = regexLocations(dockerfile).find((l) => l.pattern.test(builtWorkerPath));

function workerPolicy(): Map<string, string[]> {
  const header = /add_header Content-Security-Policy "([^"]+)" always;/.exec(
    workerLocation?.body ?? ''
  )?.[1];
  const directives = new Map<string, string[]>();
  for (const directive of (header ?? '').split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) directives.set(name, sources);
  }
  return directives;
}

describe('Pyodide worker sandbox CSP (apps/web/Dockerfile)', () => {
  it('finds the worker entry the interpreter actually spawns', () => {
    expect(workerEntry).toBe('pythonInterpreter.worker');
    expect(existsSync(path.join(WEB_ROOT, `src/services/${workerEntry}.ts`))).toBe(true);
  });

  it('has an nginx location for the built worker file and no other asset', () => {
    expect(workerLocation).toBeDefined();
    expect(workerLocation?.pattern.test('/assets/js/index-CftX_DIY.js')).toBe(false);
    expect(workerLocation?.pattern.test(`/assets/${workerEntry}-DRJ9tB4d.js.map`)).toBe(false);
  });

  it('keeps the immutable caching of the /assets/ block it overrides', () => {
    expect(workerLocation?.body).toContain('expires 1y;');
    expect(workerLocation?.body).toContain('add_header Cache-Control "public, immutable";');
  });

  it('denies everything the interpreter does not need', () => {
    const policy = workerPolicy();
    expect(policy.get('default-src')).toEqual(["'none'"]);
  });

  it('allows network access to /pyodide/ only — never /api, never the whole origin', () => {
    const connect = workerPolicy().get('connect-src') ?? [];
    expect(connect.length).toBeGreaterThan(0);
    for (const source of connect) {
      expect(source).toMatch(/^\$host(:\*)?\/pyodide\/$/);
    }
  });

  it('loads the runtime and WebAssembly but cannot eval', () => {
    const script = workerPolicy().get('script-src') ?? [];
    expect(script).toContain("'wasm-unsafe-eval'");
    for (const source of script.filter((s) => !s.startsWith("'"))) {
      expect(source).toMatch(/^\$host(:\*)?\/pyodide\/$/);
    }
    for (const forbidden of ["'unsafe-eval'", "'unsafe-inline'", "'self'", '*', 'data:', 'blob:']) {
      expect(script).not.toContain(forbidden);
    }
  });
});
