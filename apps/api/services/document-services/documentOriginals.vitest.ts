import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  documentOriginalsDir,
  keepOriginal,
  originalResponseHeaders,
  removeOriginal,
  removeUserOriginals,
  resolveOriginalPath,
} from './documentOriginals.js';

let base: string;

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'originals-'));
  vi.stubEnv('DOCUMENT_ORIGINALS_DIR', base);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(base, { recursive: true, force: true });
});

describe('resolveOriginalPath', () => {
  it('stays inside the originals dir', () => {
    expect(documentOriginalsDir()).toBe(base);
    expect(resolveOriginalPath('u1/d1.pdf')).toBe(path.join(base, 'u1/d1.pdf'));
  });

  it.each(['../../etc/passwd', '/etc/passwd', 'u1/../../x', '', 'u1/..'])('rejects %j', (p) => {
    expect(resolveOriginalPath(p)).toBeNull();
  });
});

describe('originalResponseHeaders', () => {
  it('serves a PDF inline', () => {
    const h = originalResponseHeaders('Antrag.pdf', 'application/pdf');
    expect(h['Content-Type']).toBe('application/pdf');
    expect(h['Content-Disposition']).toMatch(/^inline;/);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    // Chrome's PDF viewer does not run inside a sandboxed document.
    expect(h).not.toHaveProperty('Content-Security-Policy');
  });

  it('serves an image inline and sandboxed', () => {
    const h = originalResponseHeaders('Plakat.png', null);
    expect(h['Content-Disposition']).toMatch(/^inline;/);
    expect(h['Content-Security-Policy']).toBe('sandbox');
  });

  it('sends a DOCX as attachment', () => {
    const h = originalResponseHeaders('Satzung.docx', null);
    expect(h['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(h['Content-Disposition']).toMatch(/^attachment;/);
  });

  it('encodes umlauts and quotes in the filename', () => {
    const h = originalResponseHeaders('Grüne "Ideen".pdf', 'application/pdf');
    expect(h['Content-Disposition']).toContain("filename*=UTF-8''Gr%C3%BCne%20%22Ideen%22.pdf");
    const plain = /filename="([^"]*)"/.exec(h['Content-Disposition'])?.[1];
    expect(plain).toBe('Grne Ideen.pdf');
  });

  it('falls back to an octet-stream attachment for an unknown format', () => {
    const h = originalResponseHeaders('x.exe', 'text/html');
    expect(h['Content-Type']).toBe('application/octet-stream');
    expect(h['Content-Disposition']).toMatch(/^attachment;/);
  });

  it('never trusts the client mimetype over the extension', () => {
    expect(originalResponseHeaders('a.txt', 'text/html')['Content-Type']).toBe('text/plain');
  });
});

describe('keepOriginal', () => {
  it('copies the pending file and returns the relative path', async () => {
    const pendingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-'));
    const pending = path.join(pendingDir, 'upload-123.pdf');
    fs.writeFileSync(pending, '%PDF-1.4');

    const rel = await keepOriginal(pending, { userId: 'u1', documentId: 'd1', filename: 'a.PDF' });

    expect(rel).toBe('u1/d1.pdf');
    expect(fs.existsSync(pending)).toBe(true);
    expect(fs.readFileSync(path.join(base, 'u1/d1.pdf'), 'utf8')).toBe('%PDF-1.4');
    fs.rmSync(pendingDir, { recursive: true, force: true });
  });
});

describe('removeOriginal / removeUserOriginals', () => {
  it('removes one file and is silent for null or a missing file', async () => {
    fs.mkdirSync(path.join(base, 'u1'));
    fs.writeFileSync(path.join(base, 'u1/d1.pdf'), 'x');
    await removeOriginal('u1/d1.pdf');
    expect(fs.existsSync(path.join(base, 'u1/d1.pdf'))).toBe(false);
    await expect(removeOriginal('u1/d1.pdf')).resolves.toBeUndefined();
    await expect(removeOriginal(null)).resolves.toBeUndefined();
  });

  it('never removes outside the originals dir', async () => {
    const outside = path.join(base, '..', `outside-${path.basename(base)}`);
    fs.writeFileSync(outside, 'keep');
    await removeOriginal(`../${path.basename(outside)}`);
    expect(fs.existsSync(outside)).toBe(true);
    fs.rmSync(outside);
  });

  it('removes all originals of one user', async () => {
    fs.mkdirSync(path.join(base, 'u1'));
    fs.mkdirSync(path.join(base, 'u2'));
    fs.writeFileSync(path.join(base, 'u1/d1.pdf'), 'x');
    fs.writeFileSync(path.join(base, 'u2/d2.pdf'), 'y');
    await removeUserOriginals('u1');
    expect(fs.existsSync(path.join(base, 'u1'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'u2/d2.pdf'))).toBe(true);
  });

  it('refuses a user id that would escape the dir', async () => {
    await removeUserOriginals('..');
    expect(fs.existsSync(base)).toBe(true);
  });
});
