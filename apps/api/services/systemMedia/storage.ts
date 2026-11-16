import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { Readable } from 'stream';

export interface SystemMediaStorage {
  putFromFile(key: string, sourcePath: string): Promise<void>;
  stat(key: string): Promise<{ size: number } | null>;
  openRead(key: string, range: { start: number; end: number } | null): Readable;
  /** Absolute path for local drivers; a remote (S3) driver returns null. */
  resolveLocalPath(key: string): string | null;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;

function assertValidKey(key: string): void {
  if (!KEY_RE.test(key) || key.split('/').some((seg) => seg === '..' || seg === '.')) {
    throw new Error(`Invalid system media key: ${key}`);
  }
}

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class LocalSystemMediaStorage implements SystemMediaStorage {
  constructor(private readonly root: string) {}

  resolveLocalPath(key: string): string {
    assertValidKey(key);
    return path.join(this.root, key);
  }

  async putFromFile(key: string, sourcePath: string): Promise<void> {
    const target = this.resolveLocalPath(key);
    await fsPromises.mkdir(path.dirname(target), { recursive: true });
    try {
      await fsPromises.rename(sourcePath, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fsPromises.copyFile(sourcePath, target);
      await fsPromises.unlink(sourcePath);
    }
  }

  async stat(key: string): Promise<{ size: number } | null> {
    const stat = await fsPromises.stat(this.resolveLocalPath(key)).catch(() => null);
    return stat ? { size: stat.size } : null;
  }

  openRead(key: string, range: { start: number; end: number } | null): Readable {
    const file = this.resolveLocalPath(key);
    return range ? fs.createReadStream(file, range) : fs.createReadStream(file);
  }

  async remove(key: string): Promise<void> {
    await fsPromises.rm(this.resolveLocalPath(key), { force: true });
  }
}

let instance: SystemMediaStorage | null = null;

export function getSystemMediaStorage(): SystemMediaStorage {
  instance ??= new LocalSystemMediaStorage(
    process.env.SYSTEM_MEDIA_DIR ?? path.join(apiRoot, 'uploads', 'system-media')
  );
  return instance;
}
