import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

import { type Plugin } from 'vite';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

// html is left out on purpose: nginx rewrites index.html with `sub_filter`
// (Open Graph URLs), and sub_filter skips responses that already carry a
// Content-Encoding, so a .br/.gz next to it would silently disable that.
const COMPRESSIBLE = /\.(js|mjs|css|svg|json|wasm|txt|xml)$/i;
const MIN_BYTES = 1024;
const CONCURRENCY = 8;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function compressFile(file: string): Promise<number> {
  const source = await readFile(file);
  if (source.length < MIN_BYTES) return 0;
  const [br, gz] = await Promise.all([
    brotliAsync(source, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    }),
    gzipAsync(source, { level: 9 }),
  ]);
  let written = 0;
  // A sibling is only useful when it is smaller than the original.
  if (br.length < source.length) {
    await writeFile(`${file}.br`, br);
    written += br.length;
  }
  if (gz.length < source.length) {
    await writeFile(`${file}.gz`, gz);
    written += gz.length;
  }
  return written;
}

/**
 * Production-only: writes `<file>.br` (quality 11) and `<file>.gz` (level 9)
 * next to every compressible asset, for nginx `brotli_static` / `gzip_static`
 * (apps/web/Dockerfile). On-the-fly compression stays on as the fallback.
 * Not for the Tauri desktop bundle, which loads files from disk.
 */
export function precompressPlugin(options: { disabled: boolean }): Plugin {
  let outDir = '';
  return {
    name: 'precompress-assets',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (options.disabled) return;
      if (!(await stat(outDir).catch(() => null))) return;
      const started = Date.now();
      const pending = new Set<Promise<void>>();
      let files = 0;
      let bytes = 0;
      for await (const file of walk(outDir)) {
        if (!COMPRESSIBLE.test(file)) continue;
        const job: Promise<void> = compressFile(file).then((written) => {
          if (written > 0) files += 1;
          bytes += written;
          pending.delete(job);
        });
        pending.add(job);
        if (pending.size >= CONCURRENCY) await Promise.race(pending);
      }
      await Promise.all(pending);
      console.log(
        `precompress: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB of .br/.gz in ${((Date.now() - started) / 1000).toFixed(1)}s`
      );
    },
  };
}
