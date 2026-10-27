import { zipPageImages } from '@ggraphic/editor/utils/zipPageImages';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

const png = (bytes: number[]) => `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;

describe('zipPageImages', () => {
  it('stores each page under seite-N with its bytes intact', async () => {
    const zip = zipPageImages([png([1, 2, 3]), 'data:image/jpeg;base64,/9g=']);

    expect(zip.type).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['seite-1.png', 'seite-2.jpg']);
    expect([...entries['seite-1.png']]).toEqual([1, 2, 3]);
    expect([...entries['seite-2.jpg']]).toEqual([0xff, 0xd8]);
  });

  it('names the page it cannot pack instead of shipping a short ZIP', () => {
    expect(() => zipPageImages([png([1]), 'data:image/gif;base64,R0lG'])).toThrow('Seite 2');
    expect(() => zipPageImages([png([1]), 'kein data url'])).toThrow('Seite 2');
  });
});
