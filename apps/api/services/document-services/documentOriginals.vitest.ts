import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  keepOriginal,
  originalFile,
  removeOriginal,
  removeUserOriginals,
} from './documentOriginals.js';

const userId = `test-${randomUUID()}`;

afterEach(() => removeUserOriginals(userId));

function pendingFile(name: string, content = 'inhalt'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

describe('documentOriginals', () => {
  it('moves the upload away from pending and finds it by the stored relative path', () => {
    const source = pendingFile('abc.pdf', 'pdf-bytes');

    const relative = keepOriginal(source, userId, 'doc-1');

    expect(relative).toBe(path.join(userId, 'doc-1.pdf'));
    expect(fs.existsSync(source)).toBe(false);
    const stored = originalFile(relative);
    expect(stored).not.toBeNull();
    expect(fs.readFileSync(stored!, 'utf-8')).toBe('pdf-bytes');
  });

  it('removes a single original and a whole user directory', () => {
    const a = keepOriginal(pendingFile('a.txt'), userId, 'doc-a');
    const b = keepOriginal(pendingFile('b.txt'), userId, 'doc-b');

    removeOriginal(a);
    expect(originalFile(a)).toBeNull();
    expect(originalFile(b)).not.toBeNull();

    removeUserOriginals(userId);
    expect(originalFile(b)).toBeNull();
  });

  it('never resolves or deletes outside its directory', () => {
    const outside = pendingFile('secret.txt');

    expect(originalFile(path.relative(process.cwd(), outside))).toBeNull();
    expect(originalFile('../pending/x.pdf')).toBeNull();
    removeOriginal(`../../../${path.basename(outside)}`);
    removeUserOriginals('..');
    removeUserOriginals('');

    expect(fs.existsSync(outside)).toBe(true);
    expect(originalFile(null)).toBeNull();
  });
});
