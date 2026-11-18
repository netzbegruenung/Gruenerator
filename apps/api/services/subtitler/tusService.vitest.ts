import { randomBytes } from 'crypto';
import fs from 'fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { cleanupUploadFiles, getFilePathFromUploadId, getUploadStatus } from './tusService.js';

const created: string[] = [];

/** Writes a data file plus a sidecar shaped like @tus/file-store's (offset never updated). */
async function writeUpload(bytesOnDisk: number, declaredSize: number): Promise<string> {
  const id = randomBytes(16).toString('hex');
  created.push(id);
  const dataPath = getFilePathFromUploadId(id);
  await fs.writeFile(dataPath, Buffer.alloc(bytesOnDisk));
  await fs.writeFile(
    `${dataPath}.json`,
    JSON.stringify({ id, size: declaredSize, offset: 0, metadata: { filename: 'a.mp4' } })
  );
  return id;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((id) => cleanupUploadFiles(id, 'test')));
});

describe('getUploadStatus', () => {
  it('reads a finished TUS upload as complete although the sidecar offset is 0', async () => {
    const status = await getUploadStatus(await writeUpload(1024, 1024));
    expect(status.isComplete).toBe(true);
    expect(status.isIncomplete).toBe(false);
  });

  it('reads a partial upload as incomplete', async () => {
    const status = await getUploadStatus(await writeUpload(512, 1024));
    expect(status.isComplete).toBe(false);
    expect(status.isIncomplete).toBe(true);
  });

  it('reads an upload without a declared size as neither', async () => {
    const id = randomBytes(16).toString('hex');
    created.push(id);
    const dataPath = getFilePathFromUploadId(id);
    await fs.writeFile(dataPath, Buffer.alloc(10));
    await fs.writeFile(`${dataPath}.json`, JSON.stringify({ id, offset: 0 }));
    const status = await getUploadStatus(id);
    expect(status.isComplete).toBe(false);
    expect(status.isIncomplete).toBe(false);
  });
});
