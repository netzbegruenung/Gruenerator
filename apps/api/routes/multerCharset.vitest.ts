import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import multer from 'multer';
import { describe, expect, it } from 'vitest';

import type { Request, Response } from 'express';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Browser schicken Dateinamen im multipart-Kopf als UTF-8, multer liest sie
 * ohne `defParamCharset` als latin1: aus „Solidarität.pdf" wird
 * „SolidaritÃ¤t.pdf", und dieser Name landet als Dokumenttitel, Anhangname
 * oder Medientitel dauerhaft in der Datenbank (#4137).
 */
async function parseFilename(options: multer.Options): Promise<string> {
  const boundary = 'grenze';
  const body = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="Solidarität.pdf"\r\n' +
      'Content-Type: application/pdf\r\n\r\n' +
      `%PDF\r\n--${boundary}--\r\n`,
    'utf8'
  );
  const req = Object.assign(new PassThrough(), {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  }) as unknown as Request;
  const done = new Promise<void>((resolve, reject) => {
    multer({ storage: multer.memoryStorage(), ...options }).single('file')(
      req,
      {} as Response,
      (err?: unknown) => (err ? reject(err) : resolve())
    );
  });
  (req as unknown as PassThrough).end(body);
  await done;
  return req.file?.originalname ?? '';
}

function multerSources(): string[] {
  const files: string[] = [path.join(apiRoot, 'server.ts')];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts') && !entry.name.includes('.vitest.')) files.push(full);
    }
  };
  walk(path.join(apiRoot, 'routes'));
  return files.filter((file) => fs.readFileSync(file, 'utf8').includes('multer({'));
}

/** Der Options-Block eines `multer({ … })`-Aufrufs, über Klammertiefe abgegrenzt. */
function multerOptionBlocks(source: string): string[] {
  const blocks: string[] = [];
  let from = source.indexOf('multer({');
  while (from !== -1) {
    let depth = 0;
    let end = from + 'multer('.length;
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}' && --depth === 0) break;
    }
    blocks.push(source.slice(from, end + 1));
    from = source.indexOf('multer({', end);
  }
  return blocks;
}

describe('multer-Dateinamen', () => {
  it('liest UTF-8-Dateinamen nur mit defParamCharset richtig', async () => {
    expect(await parseFilename({})).toBe('SolidaritÃ¤t.pdf');
    expect(await parseFilename({ defParamCharset: 'utf8' })).toBe('Solidarität.pdf');
  });

  it('jede multer-Instanz der API setzt defParamCharset', () => {
    const sources = multerSources();
    expect(sources.length).toBeGreaterThan(0);

    const offenders = sources.flatMap((file) =>
      multerOptionBlocks(fs.readFileSync(file, 'utf8'))
        .filter((block) => !/defParamCharset:\s*'utf8'/.test(block))
        .map(() => path.relative(apiRoot, file))
    );
    expect(offenders).toEqual([]);
  });
});
