import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashBytes } from '../scrapers/utils/binaryFingerprint.js';
import { LocalSystemMediaStorage } from '../systemMedia/storage.js';

import { loadSystemOriginal, pdfSourceFromPayload } from './systemOriginals.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF');
const HASH = hashBytes(PDF);

describe('pdfSourceFromPayload', () => {
  it('takes a direct .pdf URL, with or without a hash', () => {
    expect(pdfSourceFromPayload({ source_url: 'https://lv.example/a/b.pdf' })).toEqual({
      url: 'https://lv.example/a/b.pdf',
      fileHash: null,
    });
    expect(
      pdfSourceFromPayload({ source_url: 'https://lv.example/b.pdf', file_hash: HASH })?.fileHash
    ).toBe(HASH);
  });

  it('takes a landing page when the point carries a file hash', () => {
    expect(
      pdfSourceFromPayload({ source_url: 'https://lv.example/download/x/', file_hash: HASH })
    ).toEqual({ url: 'https://lv.example/download/x/', fileHash: HASH });
  });

  it('prefers pdf_url over the page about it', () => {
    expect(
      pdfSourceFromPayload({
        source_url: 'https://partei.example/programm',
        pdf_url: 'https://partei.example/files/programm.pdf',
      })?.url
    ).toBe('https://partei.example/files/programm.pdf');
  });

  it('has nothing for HTML pages, wolke keys and junk hashes', () => {
    expect(pdfSourceFromPayload({ source_url: 'https://lv.example/beschluss/' })).toBeNull();
    expect(pdfSourceFromPayload({ source_url: 'wolke://berlin-wahlpruefsteine/a.pdf' })).toBeNull();
    expect(
      pdfSourceFromPayload({ source_url: 'https://lv.example/page', file_hash: 'nope' })
    ).toBeNull();
  });
});

describe('loadSystemOriginal', () => {
  let dir: string;
  let storage: LocalSystemMediaStorage;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sysorig-'));
    storage = new LocalSystemMediaStorage(dir);
  });
  afterAll(() => fs.rm(dir, { recursive: true, force: true }));

  const serving = (bytes: Buffer) =>
    vi.fn(() => Promise.resolve(new Response(new Uint8Array(bytes), { status: 200 })));

  it('caches bytes that match the indexed hash and serves the copy after', async () => {
    const fetchUrl = serving(PDF);
    const source = { url: 'https://lv.example/a.pdf', fileHash: HASH };

    const first = await loadSystemOriginal(source, { storage, fetchUrl });
    expect(first).toEqual({ kind: 'stored', key: `scraped-pdf/${HASH}.pdf`, size: PDF.length });
    const second = await loadSystemOriginal(source, { storage, fetchUrl });
    expect(second?.kind).toBe('stored');
    expect(fetchUrl).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(path.join(dir, `scraped-pdf/${HASH}.pdf`))).toEqual(PDF);
  });

  it('serves a changed file once without caching it', async () => {
    const changed = Buffer.concat([PDF, Buffer.from('\n% edited')]);
    const other = 'a'.repeat(64);
    const result = await loadSystemOriginal(
      { url: 'https://lv.example/b.pdf', fileHash: other },
      { storage, fetchUrl: serving(changed) }
    );
    expect(result).toEqual({ kind: 'fresh', bytes: changed });
    expect(await storage.stat(`scraped-pdf/${other}.pdf`)).toBeNull();
  });

  it('serves a point without hash uncached', async () => {
    const result = await loadSystemOriginal(
      { url: 'https://lv.example/c.pdf', fileHash: null },
      { storage, fetchUrl: serving(PDF) }
    );
    expect(result?.kind).toBe('fresh');
  });

  it('has nothing when the source answers HTML', async () => {
    const result = await loadSystemOriginal(
      { url: 'https://lv.example/d.pdf', fileHash: 'b'.repeat(64) },
      { storage, fetchUrl: serving(Buffer.from('<html>404</html>')) }
    );
    expect(result).toBeNull();
  });
});
